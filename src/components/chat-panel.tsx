'use client';

import { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Ably from 'ably';
import type { UIMessage } from 'ai';
import { isToolUIPart } from 'ai';
import { ChatMessage } from './chat-message';
import { LiveViewPanel } from './live-view-panel';

// ---------------------------------------------------------------------------
// Types & helpers
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  conversationId: string | null;
  onConversationCreated: (id: string) => void;
  isMobile?: boolean;
  onOpenSidebar?: () => void;
}

interface ConversationData {
  messages: UIMessage[];
  pendingIdentityConnection: boolean;
  isGenerating: boolean;
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

const SUGGESTIONS = [
  {
    title: 'Search for people',
    description: 'Find software engineers in San Francisco',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="8" />
        <line x1="21" y1="21" x2="16.65" y2="16.65" />
      </svg>
    ),
  },
  {
    title: 'Send a message',
    description: 'Message my connections about a new role',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Create a post',
    description: 'Share an update about our product launch',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
      </svg>
    ),
  },
  {
    title: 'Find jobs',
    description: 'Search for React developer positions',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
        <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
      </svg>
    ),
  },
];

function isUIMessageArray(value: unknown): value is UIMessage[] {
  if (!Array.isArray(value)) return false;
  return value.every(
    (item) =>
      item &&
      typeof item === 'object' &&
      'id' in item &&
      'role' in item &&
      'parts' in item &&
      Array.isArray((item as { parts: unknown[] }).parts)
  );
}

async function loadConversation(conversationId: string): Promise<ConversationData> {
  const res = await fetch(`/api/conversations/${conversationId}`);
  if (!res.ok) return { messages: [], pendingIdentityConnection: false, isGenerating: false };

  const data = await res.json();
  const pendingIdentityConnection = Boolean(
    data.conversation?.pendingIdentityConnection ?? data.conversation?.pending_identity_connection
  );
  const isGenerating = Boolean(data.isGenerating);

  if (!data.messages || !Array.isArray(data.messages)) {
    return { messages: [], pendingIdentityConnection, isGenerating };
  }

  if (isUIMessageArray(data.messages)) {
    return { messages: data.messages, pendingIdentityConnection, isGenerating };
  }

  const messages = data.messages
    .map((m: { id: string; role: string; content: string }): UIMessage | null => {
      if ((m.role !== 'user' && m.role !== 'assistant') || typeof m.content !== 'string') return null;
      if (!m.content.trim()) return null;
      return { id: m.id, role: m.role as 'user' | 'assistant', parts: [{ type: 'text' as const, text: m.content }] };
    })
    .filter((message: UIMessage | null): message is UIMessage => message !== null);

  return { messages, pendingIdentityConnection, isGenerating };
}

// ---------------------------------------------------------------------------
// Ably singleton (client-side only)
// ---------------------------------------------------------------------------

let ablyClient: Ably.Realtime | null = null;

function getAblyClient(): Ably.Realtime {
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({
      authUrl: '/api/ably-auth',
      authMethod: 'GET',
    });
  }
  return ablyClient;
}

// ---------------------------------------------------------------------------
// Hook: useAblyChat — subscribe to a chat channel for realtime updates
// ---------------------------------------------------------------------------

function useAblyChat(
  conversationId: string | null,
  onTextDelta: (data: { text: string; messageId: string }) => void,
  onToolCall: (data: { messageId: string; toolCallId: string; toolName: string; input: unknown }) => void,
  onToolResult: (data: { messageId: string; toolCallId: string; toolName: string; output: unknown }) => void,
  onStepFinish: (data: { messageId: string }) => void,
  onCompleted: (data: { messageId: string }) => void,
  onError: (data: { messageId: string; error: string }) => void,
) {
  useEffect(() => {
    if (!conversationId) return;

    const ably = getAblyClient();
    const channel = ably.channels.get(`chat:${conversationId}`);

    const handleMessage = (message: Ably.Message) => {
      const data = message.data;
      switch (message.name) {
        case 'text-delta':
          onTextDelta(data);
          break;
        case 'tool-call':
          onToolCall(data);
          break;
        case 'tool-result':
          onToolResult(data);
          break;
        case 'step-finish':
          onStepFinish(data);
          break;
        case 'completed':
          onCompleted(data);
          break;
        case 'error':
          onError(data);
          break;
      }
    };

    channel.subscribe(handleMessage);
    return () => {
      channel.unsubscribe(handleMessage);
    };
  }, [conversationId, onTextDelta, onToolCall, onToolResult, onStepFinish, onCompleted, onError]);
}

// ---------------------------------------------------------------------------
// MobilePanelHeader
// ---------------------------------------------------------------------------

function MobilePanelHeader({ onOpenSidebar }: { onOpenSidebar?: () => void }) {
  return (
    <div className="shrink-0 border-b border-border bg-background px-3 py-2.5 lg:hidden">
      <button
        type="button"
        onClick={onOpenSidebar}
        className="flex ui-control-md items-center gap-2 rounded-xl border border-border-hard bg-white px-3 text-left ui-text font-medium text-foreground transition-colors hover:bg-secondary"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <line x1="3" y1="6" x2="21" y2="6" />
          <line x1="3" y1="12" x2="21" y2="12" />
          <line x1="3" y1="18" x2="21" y2="18" />
        </svg>
        Menu
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChatPanel (top-level)
// ---------------------------------------------------------------------------

export function ChatPanel({
  conversationId,
  onConversationCreated,
  isMobile = false,
  onOpenSidebar,
}: ChatPanelProps) {
  const [resolvedId, setResolvedId] = useState(conversationId);
  const [firstMessage, setFirstMessage] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setResolvedId(conversationId);
  }, [conversationId]);

  if (resolvedId) {
    return (
      <ChatPanelInner
        conversationId={resolvedId}
        firstMessage={firstMessage}
        onClearFirstMessage={() => setFirstMessage(null)}
        isMobile={isMobile}
        onOpenSidebar={onOpenSidebar}
      />
    );
  }

  return (
    <EmptyStateWithInput
      creating={creating}
      error={error}
      isMobile={isMobile}
      onOpenSidebar={onOpenSidebar}
      onSend={async (text) => {
        setCreating(true);
        setError(null);
        try {
          const res = await fetch('/api/conversations', { method: 'POST' });
          if (!res.ok) {
            setError('Failed to create conversation');
            setCreating(false);
            return;
          }
          const data = await res.json();
          onConversationCreated(data.id);
          setFirstMessage(text);
          setResolvedId(data.id);
        } catch {
          setError('Failed to create conversation');
          setCreating(false);
        }
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// ChatPanelInner — loads conversation then renders runtime
// ---------------------------------------------------------------------------

function ChatPanelInner({
  conversationId,
  firstMessage,
  onClearFirstMessage,
  isMobile,
  onOpenSidebar,
}: {
  conversationId: string;
  firstMessage: string | null;
  onClearFirstMessage: () => void;
  isMobile: boolean;
  onOpenSidebar?: () => void;
}) {
  const [conversationData, setConversationData] = useState<ConversationData | null>(null);

  useEffect(() => {
    let cancelled = false;
    void loadConversation(conversationId)
      .then((data) => {
        if (!cancelled) setConversationData(data);
      })
      .catch(() => {
        if (!cancelled) setConversationData({ messages: [], pendingIdentityConnection: false, isGenerating: false });
      });
    return () => {
      cancelled = true;
    };
  }, [conversationId]);

  if (conversationData === null) {
    return (
      <div className="flex flex-1 flex-col overflow-hidden bg-background">
        {isMobile && <MobilePanelHeader onOpenSidebar={onOpenSidebar} />}
        <div className="flex flex-1 items-center justify-center">
          <div className="flex items-center gap-2 ui-label text-muted-foreground">
            <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
            Loading...
          </div>
        </div>
      </div>
    );
  }

  return (
    <ChatPanelRuntime
      conversationId={conversationId}
      firstMessage={firstMessage}
      onClearFirstMessage={onClearFirstMessage}
      initialMessages={conversationData.messages}
      initialIsGenerating={conversationData.isGenerating}
      pendingIdentityConnection={conversationData.pendingIdentityConnection}
      isMobile={isMobile}
      onOpenSidebar={onOpenSidebar}
    />
  );
}

// ---------------------------------------------------------------------------
// ChatPanelRuntime — manages messages + Ably realtime sync
// ---------------------------------------------------------------------------

function ChatPanelRuntime({
  conversationId,
  firstMessage,
  onClearFirstMessage,
  initialMessages,
  initialIsGenerating,
  pendingIdentityConnection,
  isMobile,
  onOpenSidebar,
}: {
  conversationId: string;
  firstMessage: string | null;
  onClearFirstMessage: () => void;
  initialMessages: UIMessage[];
  initialIsGenerating: boolean;
  pendingIdentityConnection: boolean;
  isMobile: boolean;
  onOpenSidebar?: () => void;
}) {
  const [messages, setMessages] = useState<UIMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(initialIsGenerating);
  const [liveText, setLiveText] = useState('');
  const [showLiveView, setShowLiveView] = useState(false);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sentFirstMessage = useRef(false);
  const sentPendingIdentity = useRef(false);
  const [activeMessageId, setActiveMessageId] = useState<string | null>(null);

  // Helper to update the assistant message's parts in-place
  const updateAssistantParts = useCallback(
    (msgId: string, updater: (parts: UIMessage['parts']) => UIMessage['parts']) => {
      setMessages((prev) => {
        const idx = prev.findIndex((m) => m.id === msgId);
        if (idx === -1) {
          // Create a new assistant message if not found
          return [
            ...prev,
            { id: msgId, role: 'assistant' as const, parts: updater([]) },
          ];
        }
        const updated = [...prev];
        updated[idx] = { ...updated[idx], parts: updater(updated[idx].parts) };
        return updated;
      });
    },
    []
  );

  // Ably event handlers
  const handleTextDelta = useCallback(
    (data: { text: string; messageId: string }) => {
      setActiveMessageId(data.messageId);
      setLiveText((prev) => prev + data.text);
    },
    []
  );

  const handleToolCall = useCallback(
    (data: { messageId: string; toolCallId: string; toolName: string; input: unknown }) => {
      setActiveMessageId(data.messageId);
      updateAssistantParts(data.messageId, (parts) => [
        ...parts,
        {
          type: `tool-${data.toolName}` as `tool-${string}`,
          toolCallId: data.toolCallId,
          state: 'input-available' as const,
          input: data.input ?? {},
        },
      ]);
    },
    [updateAssistantParts]
  );

  const handleToolResult = useCallback(
    (data: { messageId: string; toolCallId: string; toolName: string; output: unknown }) => {
      updateAssistantParts(data.messageId, (parts) =>
        parts.map((p) => {
          if ('toolCallId' in p && (p as { toolCallId: string }).toolCallId === data.toolCallId) {
            return {
              ...p,
              state: 'output-available',
              output: data.output,
            } as UIMessage['parts'][number];
          }
          return p;
        })
      );
    },
    [updateAssistantParts]
  );

  const handleStepFinish = useCallback(
    (data: { messageId: string }) => {
      // Flush live text into the message parts
      if (liveText) {
        updateAssistantParts(data.messageId, (parts) => [
          ...parts,
          { type: 'text' as const, text: liveText },
        ]);
        setLiveText('');
      }
    },
    [liveText, updateAssistantParts]
  );

  const handleCompleted = useCallback(
    (data: { messageId: string }) => {
      // Flush any remaining live text
      if (liveText) {
        updateAssistantParts(data.messageId, (parts) => [
          ...parts,
          { type: 'text' as const, text: liveText },
        ]);
        setLiveText('');
      }
      setIsGenerating(false);
      setActiveMessageId(null);

      // Reload from DB to get the canonical final state
      void loadConversation(conversationId).then((data) => {
        if (data.messages.length > 0) setMessages(data.messages);
      });
    },
    [liveText, updateAssistantParts, conversationId]
  );

  const handleError = useCallback(
    (data: { messageId: string; error: string }) => {
      setIsGenerating(false);
      setError(data.error);
      setActiveMessageId(null);
    },
    []
  );

  // Subscribe to Ably
  useAblyChat(
    conversationId,
    handleTextDelta,
    handleToolCall,
    handleToolResult,
    handleStepFinish,
    handleCompleted,
    handleError
  );

  // Send a message
  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || isGenerating) return;
      setError(null);

      const userMsg: UIMessage = {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      };

      setMessages((prev) => [...prev, userMsg]);
      setIsGenerating(true);
      setLiveText('');

      try {
        // Save user message optimistically
        fetch('/api/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId, role: 'user', content: text }),
        }).catch(() => {});

        // Fire-and-forget: start generation in background
        const res = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            conversationId,
            messages: [...messages, userMsg],
          }),
        });

        if (!res.ok) {
          setIsGenerating(false);
          setError('Failed to send message');
          return;
        }

        const data = await res.json();
        setActiveMessageId(data.assistantMsgId);
      } catch {
        setIsGenerating(false);
        setError('Failed to send message');
      }
    },
    [conversationId, isGenerating, messages]
  );

  // Auto-send first message
  useEffect(() => {
    if (!firstMessage || sentFirstMessage.current) return;
    queueMicrotask(() => {
      if (sentFirstMessage.current) return;
      sentFirstMessage.current = true;
      handleSend(firstMessage);
      onClearFirstMessage();
    });
  }, [firstMessage, handleSend, onClearFirstMessage]);

  // Auto-send pending identity connection message
  useEffect(() => {
    if (!pendingIdentityConnection || isGenerating || sentPendingIdentity.current) return;
    sentPendingIdentity.current = true;
    fetch(`/api/conversations/${conversationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pending_identity_connection: 0 }),
    }).catch(() => {});
    queueMicrotask(() => {
      handleSend('My LinkedIn identity was just connected. Should I continue with what I asked?');
    });
  }, [pendingIdentityConnection, isGenerating, handleSend, conversationId]);

  // Auto-scroll on new messages/text
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, liveText]);

  // Extract live view URL from tool outputs
  const toolLiveViewUrl = useMemo(() => {
    for (const msg of messages) {
      for (const part of msg.parts) {
        if (isToolUIPart(part)) {
          const output = 'output' in part ? (part as { output?: { liveViewUrl?: string } }).output : undefined;
          if (output?.liveViewUrl) return output.liveViewUrl;
        }
      }
    }
    return null;
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    setInput('');
    handleSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  // Build display messages — merge live text into assistant message if streaming
  const displayMessages = useMemo(() => {
    if (!liveText || !activeMessageId) return messages;

    const msgId = activeMessageId;
    const idx = messages.findIndex((m) => m.id === msgId);
    if (idx === -1) {
      // Create a temporary assistant message with the live text
      return [
        ...messages,
        {
          id: msgId,
          role: 'assistant' as const,
          parts: [{ type: 'text' as const, text: liveText }],
        },
      ];
    }

    // Append live text to the existing assistant message
    const updated = [...messages];
    updated[idx] = {
      ...updated[idx],
      parts: [...updated[idx].parts, { type: 'text' as const, text: liveText }],
    };
    return updated;
  }, [messages, liveText, activeMessageId]);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {isMobile && <MobilePanelHeader onOpenSidebar={onOpenSidebar} />}

      <div ref={scrollRef} className="flex-1 overflow-y-auto">
        <div className="chat-content-max mx-auto px-4 pb-32 pt-5 sm:px-6">
          <div className="space-y-4">
            {displayMessages.map((message) => (
              <ChatMessage
                key={message.id}
                message={message}
                animateAssistantText={message.role === 'assistant' && message.id === activeMessageId}
                isAssistantStreaming={isGenerating}
              />
            ))}
            {isGenerating && (displayMessages.length === 0 || displayMessages[displayMessages.length - 1]?.role !== 'assistant') && (
              <div className="flex items-center gap-2 ui-label text-muted-foreground">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-brand" />
                Processing...
              </div>
            )}
          </div>
        </div>
      </div>

      {showLiveView && <LiveViewPanel url={toolLiveViewUrl} />}

      {error && (
        <div className="shrink-0 px-3">
          <div className="chat-content-max mx-auto rounded-lg bg-destructive/10 px-3 py-2 ui-label text-destructive">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 pb-3 pt-1">
        <form onSubmit={handleSubmit} className="chat-content-max mx-auto">
          <div className="rounded-xl border border-border-hard/50 bg-background shadow-sm">
            <div className="px-3 pt-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about LinkedIn..."
                className="ui-body w-full resize-none bg-transparent leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                rows={1}
                style={{ minHeight: '68px', maxHeight: '200px' }}
                disabled={isGenerating}
              />
            </div>

            <div className="flex ui-control-md items-center justify-between border-t border-dashed border-border px-2">
              <div className="flex items-center gap-1">
                {toolLiveViewUrl && (
                  <button
                    type="button"
                    onClick={() => setShowLiveView((prev) => !prev)}
                    className={`flex ui-control-sm items-center gap-1.5 rounded-lg px-2 ui-label transition-colors ${
                      showLiveView
                        ? 'bg-secondary text-foreground'
                        : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }`}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                      <line x1="8" y1="21" x2="16" y2="21" />
                      <line x1="12" y1="17" x2="12" y2="21" />
                    </svg>
                    Live view
                  </button>
                )}
              </div>

              <div className="flex items-center">
                <button
                  type="submit"
                  disabled={!input.trim() || isGenerating}
                  className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all enabled:hover:opacity-90 disabled:bg-secondary disabled:text-muted-foreground"
                >
                  {isGenerating ? (
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <line x1="12" y1="19" x2="12" y2="5" />
                      <polyline points="5 12 12 5 19 12" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// EmptyStateWithInput
// ---------------------------------------------------------------------------

function EmptyStateWithInput({
  creating,
  error,
  onSend,
  isMobile,
  onOpenSidebar,
}: {
  creating: boolean;
  error: string | null;
  onSend: (text: string) => void;
  isMobile: boolean;
  onOpenSidebar?: () => void;
}) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = '0';
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text || creating) return;
    onSend(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-background">
      {isMobile && <MobilePanelHeader onOpenSidebar={onOpenSidebar} />}

      <div className="flex flex-1 flex-col items-center justify-center px-5">
        <div className="mb-8 text-center">
          <h1 className="ui-title font-semibold tracking-tight text-foreground">{getGreeting()}</h1>
          <p className="mt-2 ui-text text-muted-foreground">What would you like to do on LinkedIn today?</p>
        </div>

        <div className="grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {SUGGESTIONS.map((suggestion) => (
            <button
              key={suggestion.title}
              onClick={() => onSend(suggestion.description)}
              disabled={creating}
              className="group flex flex-col gap-2 rounded-xl border border-border p-3 text-left transition-colors hover:border-border-hard hover:bg-secondary disabled:opacity-50"
            >
              <div className="flex items-center gap-2 ui-text font-medium text-foreground">
                <span className="shrink-0 text-muted-foreground transition-colors group-hover:text-foreground">
                  {suggestion.icon}
                </span>
                {suggestion.title}
              </div>
              <div className="ui-label leading-snug text-muted-foreground">{suggestion.description}</div>
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="shrink-0 px-3">
          <div className="chat-content-max mx-auto rounded-lg bg-destructive/10 px-3 py-2 ui-label text-destructive">
            {error}
          </div>
        </div>
      )}

      <div className="shrink-0 px-3 pb-3 pt-1">
        <form onSubmit={handleSubmit} className="chat-content-max mx-auto">
          <div className="rounded-xl border border-border-hard/50 bg-background shadow-sm">
            <div className="px-3 pt-3">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask me anything about LinkedIn..."
                className="ui-body w-full resize-none bg-transparent leading-relaxed text-foreground placeholder:text-muted-foreground focus:outline-none"
                rows={1}
                style={{ minHeight: '68px', maxHeight: '200px' }}
                disabled={creating}
              />
            </div>

            <div className="flex ui-control-md items-center justify-end border-t border-dashed border-border px-2">
              <button
                type="submit"
                disabled={!input.trim() || creating}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-all enabled:hover:opacity-90 disabled:bg-secondary disabled:text-muted-foreground"
              >
                {creating ? (
                  <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <line x1="12" y1="19" x2="12" y2="5" />
                    <polyline points="5 12 12 5 19 12" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
