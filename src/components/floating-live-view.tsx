'use client';

import { useState, useRef, useCallback, useEffect } from 'react';

interface FloatingLiveViewProps {
  url: string;
  onClose: () => void;
}

const MIN_WIDTH = 280;
const MIN_HEIGHT = 200;
const DEFAULT_WIDTH = 400;
const DEFAULT_HEIGHT = 300;
const MARGIN = 16;
const TITLE_BAR_HEIGHT = 32;

export function FloatingLiveView({ url, onClose }: FloatingLiveViewProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
  const [interacting, setInteracting] = useState(false);

  const isDragging = useRef(false);
  const isResizing = useRef(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const resizeStart = useRef({ pointerX: 0, pointerY: 0, width: 0, height: 0 });
  const sizeRef = useRef(size);

  useEffect(() => {
    sizeRef.current = size;
  }, [size]);

  // Compute initial position (bottom-right) on mount
  useEffect(() => {
    setPosition({
      x: window.innerWidth - DEFAULT_WIDTH - MARGIN,
      y: window.innerHeight - DEFAULT_HEIGHT - MARGIN,
    });
  }, []);

  // Clamp position on viewport resize
  useEffect(() => {
    const onResize = () => {
      setPosition((prev) => {
        if (!prev) return prev;
        return {
          x: Math.min(prev.x, window.innerWidth - sizeRef.current.width - MARGIN),
          y: Math.min(prev.y, window.innerHeight - sizeRef.current.height - MARGIN),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const clampPosition = useCallback(
    (x: number, y: number) => ({
      x: Math.max(0, Math.min(x, window.innerWidth - sizeRef.current.width)),
      y: Math.max(0, Math.min(y, window.innerHeight - TITLE_BAR_HEIGHT)),
    }),
    [],
  );

  // --- Drag handlers ---
  const onDragPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      setPosition((prev) => {
        if (!prev) return prev;
        dragOffset.current = { x: e.clientX - prev.x, y: e.clientY - prev.y };
        return prev;
      });
      isDragging.current = true;
      setInteracting(true);
      e.currentTarget.setPointerCapture(e.pointerId);
    },
    [],
  );

  const onDragPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging.current) return;
      const next = clampPosition(
        e.clientX - dragOffset.current.x,
        e.clientY - dragOffset.current.y,
      );
      setPosition(next);
    },
    [clampPosition],
  );

  const onDragPointerUp = useCallback(() => {
    isDragging.current = false;
    setInteracting(false);
  }, []);

  // --- Resize handlers ---
  const onResizePointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      resizeStart.current = {
        pointerX: e.clientX,
        pointerY: e.clientY,
        width: sizeRef.current.width,
        height: sizeRef.current.height,
      };
      isResizing.current = true;
      setInteracting(true);
      e.currentTarget.setPointerCapture(e.pointerId);
      e.stopPropagation();
    },
    [],
  );

  const onResizePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isResizing.current) return;
      const dx = e.clientX - resizeStart.current.pointerX;
      const dy = e.clientY - resizeStart.current.pointerY;
      setSize({
        width: Math.max(MIN_WIDTH, resizeStart.current.width + dx),
        height: Math.max(MIN_HEIGHT, resizeStart.current.height + dy),
      });
    },
    [],
  );

  const onResizePointerUp = useCallback(() => {
    isResizing.current = false;
    setInteracting(false);
  }, []);

  if (!position) return null;

  return (
    <div
      className="fixed z-50 flex flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
      style={{ left: position.x, top: position.y, width: size.width, height: size.height }}
    >
      {/* Title bar — drag handle */}
      <div
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerUp}
        onPointerCancel={onDragPointerUp}
        className="flex h-8 shrink-0 cursor-grab items-center justify-between border-b border-border bg-secondary px-3 select-none active:cursor-grabbing"
      >
        <span className="flex items-center gap-2 ui-label text-foreground">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          Live View
        </span>
        <button
          onPointerDown={(e) => e.stopPropagation()}
          onClick={onClose}
          className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground transition-colors hover:bg-background hover:text-foreground"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>

      {/* Iframe */}
      <div className="relative flex-1">
        <iframe
          src={url}
          className="h-full w-full border-0"
          allow="clipboard-read; clipboard-write"
          title="Anchorbrowser Live View"
        />
        {/* Overlay to prevent iframe from stealing pointer events during drag/resize */}
        <div
          className="absolute inset-0"
          style={{ pointerEvents: interacting ? 'auto' : 'none' }}
        />
      </div>

      {/* Resize handle — bottom-right corner */}
      <div
        onPointerDown={onResizePointerDown}
        onPointerMove={onResizePointerMove}
        onPointerUp={onResizePointerUp}
        onPointerCancel={onResizePointerUp}
        className="absolute bottom-0 right-0 h-4 w-4 cursor-nwse-resize"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 10 10"
          className="absolute bottom-0.5 right-0.5 text-muted-foreground/50"
        >
          <line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.5" />
          <line x1="9" y1="5" x2="5" y2="9" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </div>
    </div>
  );
}
