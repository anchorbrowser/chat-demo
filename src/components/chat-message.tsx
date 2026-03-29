'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { UIMessage } from 'ai';
import { isToolUIPart, getToolName } from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const MIN_TOOL_SKELETON_MS = 300;
const INVALID_COMPONENT_OUTPUT_TIMEOUT_MS = 1200;

const TOOL_DISPLAY_NAMES: Record<string, string> = {
  list_applications: 'Finding Applications',
  create_application: 'Creating Application',
  list_identities: 'Search Accounts',
  select_identity: 'Connecting Account',
  create_identity_link: 'Create Connection',
  perform_web_task: 'Executing Task',
  linkedin_search_people: 'Search People',
  linkedin_view_profile: 'View Profile',
  linkedin_send_connection_request: 'Send Connection Request',
  linkedin_send_message: 'Send Message',
  linkedin_search_jobs: 'Search Jobs',
  linkedin_create_post: 'Create Post',
  linkedin_react_to_post: 'React to Post',
  linkedin_comment_on_post: 'Comment on Post',
  linkedin_get_feed: 'Get Feed',
  linkedin_get_notifications: 'Get Notifications',
};

interface ChatMessageProps {
  message: UIMessage;
  animateAssistantText?: boolean;
  isAssistantStreaming?: boolean;
}

export function ChatMessage({
  message,
  animateAssistantText = false,
  isAssistantStreaming = false,
}: ChatMessageProps) {
  const isUser = message.role === 'user';

  if (isUser) {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl bg-tertiary px-3.5 py-2 ui-body leading-relaxed text-foreground">
          {message.parts.map((part, i) =>
            part.type === 'text' ? (
              <span key={i} className="whitespace-pre-wrap">{part.text}</span>
            ) : null
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-start">
      <div className="w-full ui-body leading-relaxed">
        {message.parts.map((part, i) => {
          if (part.type === 'text' && part.text) {
            return (
              <AssistantTextPart
                key={`${message.id}:text:${i}`}
                text={part.text}
                animate={animateAssistantText}
                isStreaming={isAssistantStreaming}
              />
            );
          }

          if (isToolUIPart(part)) {
            const toolName = getToolName(part);
            const partKey = `${message.id}:tool:${i}:${toolName}`;
            return <ToolPart key={partKey} part={part} toolName={toolName} />;
          }

          return null;
        })}
      </div>
    </div>
  );
}

function AssistantTextPart({
  text,
  animate,
  isStreaming,
}: {
  text: string;
  animate: boolean;
  isStreaming: boolean;
}) {
  const reducedMotion = usePrefersReducedMotion();
  const markdownHeavy = useMemo(() => hasComplexMarkdown(text), [text]);
  const shouldType = animate && isStreaming && !reducedMotion && !markdownHeavy;

  if (shouldType) {
    return (
      <FastTypewriterText text={text} isStreaming={isStreaming} />
    );
  }

  return (
    <div className="prose max-w-none">
      <ReactMarkdown remarkPlugins={[remarkGfm]} disallowedElements={['script', 'iframe', 'object', 'embed']} unwrapDisallowed>
        {text}
      </ReactMarkdown>
    </div>
  );
}

function ToolIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-muted-foreground">
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </svg>
  );
}

function ToolStatusBadge({ status }: { status: 'completed' | 'running' | 'failed' }) {
  if (status === 'running') {
    return (
      <span className="inline-flex items-baseline text-xs font-medium text-blue-500">
        Running
        <span className="animate-bounce [animation-delay:0ms]">.</span>
        <span className="animate-bounce [animation-delay:150ms]">.</span>
        <span className="animate-bounce [animation-delay:300ms]">.</span>
      </span>
    );
  }

  const config = {
    completed: { label: 'Completed', classes: 'text-accent' },
    failed: { label: 'Failed', classes: 'text-destructive' },
  };
  const { label, classes } = config[status];
  return (
    <span className={`text-xs font-medium ${classes}`}>
      {label}
    </span>
  );
}

function ToolStatusBar({ toolName, status, label }: { toolName: string; status: 'completed' | 'running' | 'failed'; label?: string }) {
  return (
    <div className="my-1.5 w-full animate-in fade-in-0 duration-150">
      <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <ToolIcon />
          <span className="text-sm font-medium text-foreground">
            {label ?? formatToolName(toolName)}
          </span>
        </div>
        <ToolStatusBadge status={status} />
      </div>
    </div>
  );
}

function ToolPart({
  part,
  toolName,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  part: any;
  toolName: string;
}) {
  const { state } = part;
  const connectUrl = getIdentityConnectUrl(toolName, part);
  const requiresConnection = (toolName === 'list_identities' || toolName === 'list_linkedin_identities') && Boolean(getToolOutput(part)?.requiresIdentityConnection);
  const expectsComponent = toolName === 'create_identity_link' || Boolean(connectUrl) || requiresConnection;
  const hasValidComponentOutput = !expectsComponent || Boolean(connectUrl);

  const [phase, setPhase] = useState<'loading-skeleton' | 'ready' | 'error'>('loading-skeleton');
  const [showFallback, setShowFallback] = useState(false);
  const startedAtRef = useRef<number>(0);
  const immediateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    startedAtRef.current = Date.now();
  }, []);

  useEffect(() => {
    return () => {
      if (immediateTimerRef.current) clearTimeout(immediateTimerRef.current);
      if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (immediateTimerRef.current) clearTimeout(immediateTimerRef.current);
    if (revealTimerRef.current) clearTimeout(revealTimerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);

    const defer = (fn: () => void) => {
      immediateTimerRef.current = setTimeout(fn, 0);
    };

    if (state === 'output-error') {
      defer(() => setPhase('error'));
      return;
    }

    if (state === 'input-available' || state === 'input-streaming') {
      defer(() => {
        setPhase('loading-skeleton');
        setShowFallback(false);
      });
      return;
    }

    if (state === 'output-available') {
      if (!hasValidComponentOutput && expectsComponent) {
        defer(() => setPhase('loading-skeleton'));
        fallbackTimerRef.current = setTimeout(() => {
          setShowFallback(true);
          setPhase('ready');
        }, INVALID_COMPONENT_OUTPUT_TIMEOUT_MS);
        return;
      }

      const elapsed = Date.now() - startedAtRef.current;
      const delay = Math.max(0, MIN_TOOL_SKELETON_MS - elapsed);
      defer(() => setPhase('loading-skeleton'));
      revealTimerRef.current = setTimeout(() => {
        setPhase('ready');
      }, delay);
      return;
    }

    defer(() => setPhase('ready'));
  }, [expectsComponent, hasValidComponentOutput, state]);

  if (phase === 'loading-skeleton') {
    if (expectsComponent) {
      return <ToolSkeleton variant="component" />;
    }
    return <ToolStatusBar toolName={toolName} status="running" />;
  }

  if (phase === 'error') {
    return <ToolStatusBar toolName={toolName} status="failed" />;
  }

  if (showFallback && expectsComponent && !connectUrl) {
    return <ToolStatusBar toolName={toolName} status="failed" label="Connection link unavailable" />;
  }

  if (connectUrl) {
    return <ConnectIdentityCard connectUrl={connectUrl} />;
  }

  return <ToolStatusBar toolName={toolName} status="completed" />;
}

function ToolSkeleton({ variant }: { variant: 'component' | 'chip' }) {
  if (variant === 'component') {
    return (
      <div className="my-2.5 w-full max-w-[46rem]">
        <div className="rounded-[22px] border border-border-hard/70 bg-background px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <div className="fb-skeleton h-10 w-10 rounded-[11px]" />
              <div className="fb-skeleton h-5 w-24 rounded-md" />
            </div>
            <div className="fb-skeleton h-8 w-36 rounded-xl" />
          </div>
        </div>
        <div className="mt-2 px-1">
          <div className="fb-skeleton h-4 w-[22rem] rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="my-1.5 w-full">
      <div className="flex items-center justify-between rounded-xl border border-border bg-background px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          <div className="fb-skeleton h-4 w-4 rounded" />
          <div className="fb-skeleton h-4 w-32 rounded-md" />
        </div>
        <div className="fb-skeleton h-5 w-16 rounded-full" />
      </div>
    </div>
  );
}

function ConnectIdentityCard({ connectUrl }: { connectUrl: string }) {
  return (
    <div className="my-2.5 w-full max-w-[46rem] animate-in fade-in-0 duration-200">
      <div className="rounded-[22px] border border-border-hard/70 bg-background px-4 py-3">
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-[11px] bg-primary text-primary-foreground shadow-sm sm:h-11 sm:w-11">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 13a5 5 0 0 0 7.2.1l2.1-2.1a5 5 0 0 0-7.1-7.1L11 5" />
                <path d="M14 11a5 5 0 0 0-7.2-.1l-2.1 2.1a5 5 0 1 0 7.1 7.1L13 19" />
              </svg>
            </span>
            <div className="truncate text-[1.08rem] font-medium leading-none tracking-tight text-foreground sm:text-[1.15rem]">
              Connect Account
            </div>
          </div>

          <a
            href={connectUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-border-hard bg-background px-3.5 py-1.5 text-[0.86rem] font-semibold text-foreground shadow-sm transition-colors hover:bg-secondary sm:text-[0.9rem]"
          >
            Connect
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );
}

function formatToolName(name: string): string {
  if (TOOL_DISPLAY_NAMES[name]) return TOOL_DISPLAY_NAMES[name];
  return name
    .replace(/_/g, ' ')
    .replace(/^./, (c) => c.toUpperCase());
}

function hasComplexMarkdown(text: string): boolean {
  return /(^|\n)\s*[-*+]\s+|(^|\n)\s*\d+\.\s+|```|`[^`]+`|\[[^\]]+\]\([^)]+\)|(^|\n)\s*\|.+\|/m.test(text);
}

function usePrefersReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  return reducedMotion;
}

function FastTypewriterText({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming: boolean;
}) {
  const [visibleChars, setVisibleChars] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (visibleChars >= text.length) return;

    const backlog = text.length - visibleChars;
    const step = backlog > 180
      ? 22
      : backlog > 120
        ? 16
        : backlog > 64
          ? 10
          : backlog > 24
            ? 6
            : 3;

    timerRef.current = setTimeout(() => {
      setVisibleChars((prev) => Math.min(prev + step, text.length));
    }, isStreaming ? 20 : 10);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isStreaming, text, visibleChars]);

  return (
    <div className="my-0.5 whitespace-pre-wrap">
      {text.slice(0, Math.min(visibleChars, text.length))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getToolOutput(part: any): Record<string, unknown> | null {
  const raw = ('output' in part ? part.output : undefined) ?? ('result' in part ? part.result : undefined);
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>;
  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getIdentityConnectUrl(toolName: string, part: any): string | null {
  const output = getToolOutput(part);
  if (!output) return null;

  if (toolName === 'create_identity_link' && typeof output.url === 'string') {
    return output.url;
  }

  if ((toolName === 'list_identities' || toolName === 'list_linkedin_identities') && typeof output.connectUrl === 'string') {
    return output.connectUrl;
  }

  return null;
}
