'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SettingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsDialog({ open, onOpenChange }: SettingsDialogProps) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleDeleteAllData = async () => {
    setLoading(true);
    await fetch('/api/data', { method: 'DELETE' });
    setLoading(false);
    setConfirming(false);
    onOpenChange(false);
    window.location.reload();
  };

  const handleClose = (value: boolean) => {
    if (!value) setConfirming(false);
    onOpenChange(value);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="ui-text">Settings</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 pt-1">
          <div className="flex items-center justify-between rounded-lg border border-border p-3">
            <div>
              <div className="ui-text font-medium text-foreground">Delete all data</div>
              <div className="ui-label text-muted-foreground">Remove all conversations and messages</div>
            </div>
            {confirming ? (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => setConfirming(false)}
                  disabled={loading}
                  className="flex ui-control-sm items-center rounded-lg px-2.5 ui-label font-medium text-muted-foreground transition-colors hover:bg-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteAllData}
                  disabled={loading}
                  className="flex ui-control-sm items-center rounded-lg bg-destructive px-2.5 ui-label font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
                >
                  {loading ? 'Deleting...' : 'Confirm'}
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirming(true)}
                className="flex ui-control-sm items-center rounded-lg border border-destructive/30 px-3 ui-label font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                Delete
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
