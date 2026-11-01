import { functions, httpsCallable } from '../../lib/firebase';
import { enqueueOfflineQueueItem, loadOfflineQueue, markOfflineQueueItemFailed, removeOfflineQueueItem, type OfflineQueueItem } from './offlineQueue';

/**
 * Offline field events (arrival note, photos, materials, notes, completion evidence).
 * Each event carries a stable clientEventId (the queue item id), so a retried sync is de-duplicated
 * by the server. Conflicts (reassigned/closed ticket) stay in the queue as failed for manual review.
 * Needs real Android/iOS device testing under Capacitor.
 */
export type FieldEventType = 'ARRIVAL_NOTE' | 'PHOTOS' | 'MATERIALS' | 'NOTE' | 'COMPLETION_EVIDENCE';
type FieldEventPayload = { kind: 'field_event'; ticketId: string; type: FieldEventType; capturedAtMs: number; payload: Record<string, unknown> };

const newId = () => {
  const c = globalThis.crypto;
  if (c?.randomUUID) return c.randomUUID().replace(/[^A-Za-z0-9_-]/g, '');
  const bytes = c.getRandomValues(new Uint8Array(12));
  return `${Date.now()}_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
};

export function enqueueFieldEvent(ticketId: string, type: FieldEventType, payload: Record<string, unknown>, label: string) {
  const body: FieldEventPayload = { kind: 'field_event', ticketId, type, capturedAtMs: Date.now(), payload };
  return enqueueOfflineQueueItem({ id: `fe_${newId()}`, type: 'job_note', label, detail: ticketId, payload: JSON.stringify(body) });
}

export function parseFieldEvent(item: OfflineQueueItem): FieldEventPayload | null {
  try {
    const p = item.payload ? JSON.parse(item.payload) : null;
    return p?.kind === 'field_event' ? p : null;
  } catch {
    return null;
  }
}

export async function syncOfflineFieldEvents() {
  const items = loadOfflineQueue().filter((i) => i.status !== 'failed' && parseFieldEvent(i)).slice(0, 25);
  if (!items.length) return { synced: 0, duplicates: 0, conflicts: 0 };
  const events = items.map((i) => ({ clientEventId: i.id, ...parseFieldEvent(i)! }));
  const res: any = await httpsCallable(functions, 'technicianSyncOfflineEvents')({ events });
  let synced = 0; let duplicates = 0; let conflicts = 0;
  for (const r of res?.data?.results ?? []) {
    if (r.result === 'ACCEPTED') { synced += 1; removeOfflineQueueItem(r.clientEventId); }
    else if (r.result === 'DUPLICATE') { duplicates += 1; removeOfflineQueueItem(r.clientEventId); }
    else { conflicts += 1; markOfflineQueueItemFailed(r.clientEventId); }
  }
  return { synced, duplicates, conflicts };
}
