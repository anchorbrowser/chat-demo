'use client';

import { useState, useEffect, useCallback, type MutableRefObject } from 'react';
import { SettingsDialog } from './settings-dialog';
import type { Conversation } from '@/lib/db';

interface ChatSidebarProps {
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  isOpen: boolean;
  onToggle: () => void;
  isMobile: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  userName: string;
  userEmail: string;
  onRefreshRef?: MutableRefObject<(() => void) | null>;
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

function AnchorMark({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-lg bg-foreground"
      style={{ width: `${size}px`, height: `${size}px` }}
      aria-hidden
    >
      <svg width={Math.round(size * 0.52)} height={Math.round(size * 0.46)} viewBox="0 0 79 69" fill="none">
        <path d="M70.8481 41.1215L47.8049 1.20664C47.3728 0.459672 46.5769 0 45.715 0H32.6718C31.81 0 31.014 0.459672 30.582 1.20664L24.0615 12.5005C23.6316 13.2475 23.6316 14.1668 24.0615 14.9117L37.3686 37.957C38.1794 39.3616 37.1664 41.1194 35.5427 41.1194H8.93062C8.06874 41.1194 7.27282 41.5791 6.84082 42.326L0.322409 53.6221C-0.10747 54.369 -0.10747 55.2884 0.322409 56.0332L6.84295 67.3292C7.27495 68.0762 8.07087 68.5359 8.93275 68.5359H21.976C22.8378 68.5359 23.6338 68.0762 24.0658 67.3292L37.3728 44.2839C38.1858 42.8793 40.2139 42.8793 41.0247 44.2839L54.3318 67.3292C54.7616 68.0762 55.5597 68.5359 56.4216 68.5359H69.4648C70.3267 68.5359 71.1226 68.0762 71.5546 67.3292L78.0751 56.0332C78.505 55.2862 78.505 54.3669 78.0751 53.6221L70.8566 41.1215H70.8481Z" fill="currentColor" className="text-background"/>
      </svg>
    </div>
  );
}

// Group conversations by time period
function groupConversations(conversations: Conversation[]) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 86400000);
  const weekAgo = new Date(today.getTime() - 7 * 86400000);

  const groups: { label: string; items: Conversation[] }[] = [];
  const todayItems: Conversation[] = [];
  const yesterdayItems: Conversation[] = [];
  const weekItems: Conversation[] = [];
  const olderItems: Conversation[] = [];

  for (const conv of conversations) {
    const created = new Date(conv.createdAt);
    if (created >= today) todayItems.push(conv);
    else if (created >= yesterday) yesterdayItems.push(conv);
    else if (created >= weekAgo) weekItems.push(conv);
    else olderItems.push(conv);
  }

  if (todayItems.length > 0) groups.push({ label: 'Today', items: todayItems });
  if (yesterdayItems.length > 0) groups.push({ label: 'Yesterday', items: yesterdayItems });
  if (weekItems.length > 0) groups.push({ label: 'This Week', items: weekItems });
  if (olderItems.length > 0) groups.push({ label: 'Older', items: olderItems });

  return groups;
}

export function ChatSidebar({
  activeId, onSelect, onNew, isOpen, onToggle,
  isMobile, mobileOpen, onCloseMobile,
  userName, userEmail, onRefreshRef,
}: ChatSidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch('/api/conversations');
      if (res.ok) setConversations(await res.json());
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    if (onRefreshRef) onRefreshRef.current = fetchConversations;
  }, [onRefreshRef, fetchConversations]);

  useEffect(() => {
    const t = window.setTimeout(() => void fetchConversations(), 0);
    return () => window.clearTimeout(t);
  }, [fetchConversations]);

  const recentThreads = conversations.slice(0, 30);
  const groups = groupConversations(recentThreads);

  const handleSelect = (id: string) => { onSelect(id); if (isMobile) onCloseMobile(); };
  const handleNew = () => { onNew(); if (isMobile) onCloseMobile(); };

  /* ── Expanded sidebar content ── */
  const ExpandedContent = (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="shrink-0 px-4 pt-4 pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <AnchorMark size={30} />
            <span className="ui-label font-semibold tracking-wide text-foreground">
              Anchor Agents
            </span>
          </div>
          <button
            onClick={isMobile ? onCloseMobile : onToggle}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title={isMobile ? 'Close Sidebar' : 'Collapse Sidebar'}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {isMobile ? (
                <><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></>
              ) : (
                <><rect x="3" y="3" width="18" height="18" rx="2" /><line x1="9" y1="3" x2="9" y2="21" /><path d="M15 8l-3 4 3 4" /></>
              )}
            </svg>
          </button>
        </div>
      </div>

      {/* New Thread */}
      <div className="shrink-0 px-3 pb-2">
        <button
          onClick={handleNew}
          className="flex h-9 w-full cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 text-left ui-label font-medium text-foreground shadow-sm transition-colors hover:bg-secondary"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New Thread
        </button>
      </div>

      {/* Thread list */}
      <div className="flex-1 overflow-y-auto px-3 pb-20" style={{ scrollbarWidth: 'none' }}>
        {groups.map((group) => (
          <div key={group.label} className="mt-3 first:mt-1">
            <div className="px-2 pb-1 ui-caption font-medium uppercase tracking-widest text-muted-foreground">
              {group.label}
            </div>
            <div className="space-y-px">
              {group.items.map((conv) => {
                const active = activeId === conv.id;
                return (
                  <button
                    key={conv.id}
                    onClick={() => handleSelect(conv.id)}
                    className={`group flex h-9 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left ui-label transition-colors ${
                      active
                        ? 'bg-secondary font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-secondary/60 hover:text-foreground'
                    }`}
                  >
                    <svg
                      width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
                      className={`shrink-0 ${active ? 'text-foreground' : 'text-muted-foreground/60'}`}
                    >
                      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                    </svg>
                    <span className="truncate">{conv.title}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        {recentThreads.length === 0 && (
          <div className="px-3 py-6 text-center ui-label text-muted-foreground">
            No threads yet
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="absolute bottom-0 left-0 right-0 border-t border-border bg-background/80 px-3 py-2.5 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand ui-caption font-semibold text-white">
            {getInitials(userName)}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate ui-label font-medium text-foreground">{userName}</div>
            <div className="truncate ui-caption text-muted-foreground">{userEmail}</div>
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
          <a
            href="/auth/signout"
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Log out"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </a>
        </div>
      </div>
    </div>
  );

  /* ── Mobile: slide-over sheet ── */
  if (isMobile) {
    return (
      <>
        <div
          className={`fixed inset-0 z-40 bg-black/35 transition-opacity duration-200 lg:hidden ${
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={onCloseMobile}
        />
        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[280px] border-r border-border bg-background transition-transform duration-200 lg:hidden ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {ExpandedContent}
        </aside>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    );
  }

  /* ── Desktop collapsed: icon rail ── */
  if (!isOpen) {
    return (
      <>
        <div className="flex h-full w-[50px] flex-col items-center border-r border-border bg-background py-3">
          <button onClick={onToggle} className="cursor-pointer" title="Open Sidebar">
            <AnchorMark size={28} />
          </button>
          <button
            onClick={handleNew}
            className="mt-2 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-border bg-secondary text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="New Thread"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setSettingsOpen(true)}
            className="mb-1 flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            title="Settings"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12.22 2h-.44a2 2 0 00-2 2v.18a2 2 0 01-1 1.73l-.43.25a2 2 0 01-2 0l-.15-.08a2 2 0 00-2.73.73l-.22.38a2 2 0 00.73 2.73l.15.1a2 2 0 011 1.72v.51a2 2 0 01-1 1.74l-.15.09a2 2 0 00-.73 2.73l.22.38a2 2 0 002.73.73l.15-.08a2 2 0 012 0l.43.25a2 2 0 011 1.73V20a2 2 0 002 2h.44a2 2 0 002-2v-.18a2 2 0 011-1.73l.43-.25a2 2 0 012 0l.15.08a2 2 0 002.73-.73l.22-.39a2 2 0 00-.73-2.73l-.15-.08a2 2 0 01-1-1.74v-.5a2 2 0 011-1.74l.15-.09a2 2 0 00.73-2.73l-.22-.38a2 2 0 00-2.73-.73l-.15.08a2 2 0 01-2 0l-.43-.25a2 2 0 01-1-1.73V4a2 2 0 00-2-2z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        </div>
        <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
      </>
    );
  }

  /* ── Desktop expanded ── */
  return (
    <>
      <aside className="shell-sidebar relative hidden h-full border-r border-border bg-background lg:block">
        {ExpandedContent}
      </aside>
      <SettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
