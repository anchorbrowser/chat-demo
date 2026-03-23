'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChatSidebar } from '@/components/chat-sidebar';
import { ChatPanel } from '@/components/chat-panel';

interface ChatAppProps {
  user: { id: string; email: string; name: string };
  initialConversationId: string | null;
}

export function ChatApp({ user, initialConversationId }: ChatAppProps) {
  const router = useRouter();
  const [activeConversationId, setActiveConversationId] = useState<string | null>(initialConversationId);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [chatKey, setChatKey] = useState(0);
  const sidebarRefreshRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const sync = () => {
      const mobile = media.matches;
      setIsMobile(mobile);
      if (!mobile) setMobileSidebarOpen(false);
    };
    sync();

    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const handleNewChat = () => {
    setActiveConversationId(null);
    setChatKey((k) => k + 1);
    if (isMobile) setMobileSidebarOpen(false);
    router.push('/');
  };

  const handleSelectConversation = (id: string) => {
    setActiveConversationId(id);
    setChatKey((k) => k + 1);
    if (isMobile) setMobileSidebarOpen(false);
    router.push(`/conversation/${id}`);
  };

  const handleConversationCreated = useCallback((id: string) => {
    setActiveConversationId(id);
    sidebarRefreshRef.current?.();
    if (isMobile) setMobileSidebarOpen(false);
    // Update URL without navigation — preserves firstMessage state in ChatPanel
    window.history.replaceState(null, '', `/conversation/${id}`);
  }, [isMobile]);

  const handleSidebarToggle = () => {
    if (isMobile) {
      setMobileSidebarOpen((prev) => !prev);
      return;
    }
    setSidebarOpen((prev) => !prev);
  };

  return (
    <div className="relative flex h-screen overflow-hidden">
      <ChatSidebar
        activeId={activeConversationId}
        onSelect={handleSelectConversation}
        onNew={handleNewChat}
        isOpen={sidebarOpen}
        onToggle={handleSidebarToggle}
        isMobile={isMobile}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
        userName={user.name}
        userEmail={user.email}
        onRefreshRef={sidebarRefreshRef}
      />
      <ChatPanel
        key={chatKey}
        conversationId={activeConversationId}
        onConversationCreated={handleConversationCreated}
        isMobile={isMobile}
        onOpenSidebar={() => setMobileSidebarOpen(true)}
      />
    </div>
  );
}
