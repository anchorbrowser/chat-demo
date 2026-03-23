'use client';

import { useEffect, useCallback, useRef } from 'react';

interface IdentityPopupProps {
  onIdentityCreated: (identityId: string) => void;
}

export function useIdentityPopup({ onIdentityCreated }: IdentityPopupProps) {
  const popupRef = useRef<Window | null>(null);

  const handleMessage = useCallback(
    (event: MessageEvent) => {
      if (event.data?.type === 'identity-created' && event.data?.identityId) {
        onIdentityCreated(event.data.identityId);
        popupRef.current?.close();
        popupRef.current = null;
      }
    },
    [onIdentityCreated]
  );

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const openPopup = (url: string) => {
    const width = 600;
    const height = 700;
    const left = window.screenX + (window.innerWidth - width) / 2;
    const top = window.screenY + (window.innerHeight - height) / 2;

    popupRef.current = window.open(
      url,
      'anchorbrowser-identity',
      `width=${width},height=${height},left=${left},top=${top},popup=yes`
    );
  };

  return { openPopup };
}
