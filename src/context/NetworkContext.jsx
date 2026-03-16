import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { syncPendingOps, getPendingCount } from '../db/sync';

const NetworkContext = createContext(null);

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline]       = useState(navigator.onLine);
  const [pendingCount, setPending]    = useState(0);
  const [syncing, setSyncing]         = useState(false);
  const [lastSynced, setLastSynced]   = useState(null);

  const refreshPending = useCallback(async () => {
    const n = await getPendingCount();
    setPending(n);
  }, []);

  const runSync = useCallback(async () => {
    if (syncing || !navigator.onLine) return;
    const count = await getPendingCount();
    if (count === 0) return;
    setSyncing(true);
    try {
      const synced = await syncPendingOps();
      if (synced > 0) setLastSynced(new Date());
      await refreshPending();
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPending]);

  useEffect(() => {
    refreshPending();

    const onOnline = () => {
      setIsOnline(true);
      runSync();
    };
    const onOffline = () => setIsOnline(false);

    window.addEventListener('online',  onOnline);
    window.addEventListener('offline', onOffline);

    // Poll pending count every 30s
    const poll = setInterval(refreshPending, 30_000);

    return () => {
      window.removeEventListener('online',  onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(poll);
    };
  }, [runSync, refreshPending]);

  return (
    <NetworkContext.Provider value={{ isOnline, pendingCount, syncing, lastSynced, runSync, refreshPending }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
