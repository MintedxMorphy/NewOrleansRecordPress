export const PRODUCTION_SYNC_CHANNEL = 'norp-production-sync';
export const PRODUCTION_SYNC_STORAGE_KEY = 'norp-production-sync';
export const PRODUCTION_SYNC_POLL_MS = 15_000;
export const PRODUCTION_LOG_HEARTBEAT_MS = 4_000;

export function notifyProductionSync() {
  if (typeof window === 'undefined') return;

  try {
    const channel = new BroadcastChannel(PRODUCTION_SYNC_CHANNEL);
    channel.postMessage({ type: 'production-updated', at: Date.now() });
    channel.close();
  } catch {
    // BroadcastChannel is unavailable in some embedded browsers.
  }

  try {
    localStorage.setItem(PRODUCTION_SYNC_STORAGE_KEY, String(Date.now()));
  } catch {
    // Private mode can block localStorage.
  }
}

export function subscribeProductionSync(onUpdate: () => void) {
  const cleanups: Array<() => void> = [];

  try {
    const channel = new BroadcastChannel(PRODUCTION_SYNC_CHANNEL);
    channel.onmessage = () => onUpdate();
    cleanups.push(() => channel.close());
  } catch {
    // Fall through to storage + polling.
  }

  const onStorage = (event: StorageEvent) => {
    if (event.key === PRODUCTION_SYNC_STORAGE_KEY) onUpdate();
  };
  window.addEventListener('storage', onStorage);
  cleanups.push(() => window.removeEventListener('storage', onStorage));

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
