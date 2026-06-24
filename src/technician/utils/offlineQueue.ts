export type OfflineQueueType = 'job_action' | 'evidence_upload' | 'checkin_checkout' | 'job_note' | 'mood_checkin';
export type OfflineQueueStatus = 'pending' | 'retrying' | 'failed';

export type OfflineQueueItem = {
  id: string;
  type: OfflineQueueType;
  label: string;
  detail: string;
  status: OfflineQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt?: string;
  payload?: string;
};

export const TECHNICIAN_OFFLINE_QUEUE_KEY = 'bin_offline_queue';

export function loadOfflineQueue(): OfflineQueueItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(TECHNICIAN_OFFLINE_QUEUE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveOfflineQueue(items: OfflineQueueItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(TECHNICIAN_OFFLINE_QUEUE_KEY, JSON.stringify(items));
    window.dispatchEvent(new CustomEvent('bin-offline-queue-updated', { detail: { count: items.length } }));
  } catch {
    // Storage may be full or unavailable. The caller should still keep normal UI state.
  }
}

export function enqueueOfflineQueueItem(item: Omit<OfflineQueueItem, 'id' | 'status' | 'attempts' | 'createdAt' | 'updatedAt'> & Partial<Pick<OfflineQueueItem, 'id' | 'status' | 'attempts'>>) {
  const now = new Date().toISOString();
  const next: OfflineQueueItem = {
    id: item.id || `offline_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    type: item.type,
    label: item.label,
    detail: item.detail,
    payload: item.payload,
    status: item.status || 'pending',
    attempts: item.attempts || 0,
    createdAt: now,
    updatedAt: now,
  };
  const current = loadOfflineQueue();
  saveOfflineQueue([next, ...current]);
  return next;
}

export function removeOfflineQueueItem(id: string) {
  const current = loadOfflineQueue();
  const next = current.filter((item) => item.id !== id);
  saveOfflineQueue(next);
  return next;
}

export function clearOfflineQueue() {
  saveOfflineQueue([]);
}

export function markOfflineQueueItemRetrying(id: string) {
  const next = loadOfflineQueue().map((item) => item.id === id ? { ...item, status: 'retrying' as const, attempts: item.attempts + 1, updatedAt: new Date().toISOString() } : item);
  saveOfflineQueue(next);
  return next;
}

export function markOfflineQueueItemFailed(id: string) {
  const next = loadOfflineQueue().map((item) => item.id === id ? { ...item, status: 'failed' as const, updatedAt: new Date().toISOString() } : item);
  saveOfflineQueue(next);
  return next;
}
