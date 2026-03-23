'use client';

import { useState } from 'react';

interface LiveViewPanelProps {
  url: string | null;
}

export function LiveViewPanel({ url }: LiveViewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  if (!url) return null;

  return (
    <div className="border-t border-border">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full ui-control-md items-center justify-center gap-2 ui-label text-muted-foreground transition-colors hover:text-foreground"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
        {expanded ? 'Hide' : 'Show'} Live Browser View
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {expanded && (
        <div className="relative w-full border-t border-border" style={{ height: '400px' }}>
          <iframe
            src={url}
            className="h-full w-full border-0"
            allow="clipboard-read; clipboard-write"
            title="Anchorbrowser Live View"
          />
        </div>
      )}
    </div>
  );
}
