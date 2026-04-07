'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

interface LiveViewPanelProps {
  url: string | null;
  visible: boolean;
  onToggle: () => void;
}

const DEFAULT_W = 480;
const DEFAULT_H = 360;
const EDGE_PAD = 24;
const MIN_W = 320;
const MIN_H = 240;

export function LiveViewPanel({ url, visible, onToggle }: LiveViewPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [size, setSize] = useState({ w: DEFAULT_W, h: DEFAULT_H });
  const dragging = useRef(false);
  const resizing = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    setPos({
      x: window.innerWidth - DEFAULT_W - EDGE_PAD,
      y: window.innerHeight - DEFAULT_H - EDGE_PAD - 48,
    });
  }, []);

  useEffect(() => {
    if (visible && expanded) {
      setPos({
        x: window.innerWidth - size.w - EDGE_PAD,
        y: window.innerHeight - size.h - EDGE_PAD - 48,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const onDragStart = useCallback((e: React.PointerEvent) => {
    dragging.current = true;
    dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    setPos({
      x: Math.max(0, Math.min(window.innerWidth - size.w, e.clientX - dragOffset.current.x)),
      y: Math.max(0, Math.min(window.innerHeight - 48, e.clientY - dragOffset.current.y)),
    });
  }, [size]);

  const onDragEnd = useCallback(() => {
    dragging.current = false;
  }, []);

  const onResizeStart = useCallback((e: React.PointerEvent) => {
    resizing.current = true;
    dragOffset.current = { x: e.clientX, y: e.clientY };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const onResizeMove = useCallback((e: React.PointerEvent) => {
    if (!resizing.current) return;
    const dx = e.clientX - dragOffset.current.x;
    const dy = e.clientY - dragOffset.current.y;
    dragOffset.current = { x: e.clientX, y: e.clientY };
    setSize((prev) => ({
      w: Math.max(MIN_W, prev.w + dx),
      h: Math.max(MIN_H, prev.h + dy),
    }));
  }, []);

  const onResizeEnd = useCallback(() => {
    resizing.current = false;
  }, []);

  if (!mounted || !url || !visible) return null;

  const minimizedPill = (
    <div
      style={{ position: 'fixed', bottom: EDGE_PAD, right: EDGE_PAD, zIndex: 50 }}
      className="flex items-center gap-2 rounded-xl border border-border-hard/70 bg-background px-3 py-2 shadow-lg"
    >
      <MonitorIcon />
      <span className="text-sm font-medium text-foreground">Live Browser</span>
      <button
        onClick={() => setExpanded(true)}
        className="ml-1 rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Expand"
      >
        <ExpandIcon />
      </button>
      <button
        onClick={onToggle}
        className="rounded-md p-0.5 text-muted-foreground transition-colors hover:text-foreground"
        aria-label="Close"
      >
        <CloseIcon />
      </button>
    </div>
  );

  const expandedPanel = (
    <div
      ref={panelRef}
      style={{
        position: 'fixed',
        left: pos.x,
        top: pos.y,
        width: size.w,
        zIndex: 50,
      }}
      className="flex flex-col overflow-hidden rounded-xl border border-border-hard/70 bg-background shadow-2xl"
    >
      {/* Drag handle / header */}
      <div
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        className="flex shrink-0 cursor-grab items-center justify-between border-b border-border bg-secondary/50 px-3 py-1.5 select-none active:cursor-grabbing"
      >
        <div className="flex items-center gap-2">
          <MonitorIcon />
          <span className="text-xs font-medium text-foreground">Live Browser</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setExpanded(false)}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Minimize"
          >
            <MinimizeIcon />
          </button>
          <button
            onClick={onToggle}
            className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>
      </div>

      {/* iframe */}
      <div style={{ height: size.h }} className="relative">
        <iframe
          src={url}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
          title="Anchorbrowser Live View"
        />
        {/* Resize handle */}
        <div
          onPointerDown={onResizeStart}
          onPointerMove={onResizeMove}
          onPointerUp={onResizeEnd}
          className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
          style={{ touchAction: 'none' }}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            className="absolute bottom-0.5 right-0.5 text-muted-foreground/50"
          >
            <path d="M10 2L2 10M10 6L6 10M10 10L10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );

  return createPortal(
    expanded ? expandedPanel : minimizedPill,
    document.body,
  );
}

function MonitorIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-muted-foreground">
      <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
      <line x1="8" y1="21" x2="16" y2="21" />
      <line x1="12" y1="17" x2="12" y2="21" />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </svg>
  );
}

function MinimizeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
