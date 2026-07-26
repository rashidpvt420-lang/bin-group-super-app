import { httpsCallable, functions } from '../../lib/firebase';
import {
  enqueueOfflineQueueItem,
  loadOfflineQueue,
  markOfflineQueueItemFailed,
  markOfflineQueueItemRetrying,
  removeOfflineQueueItem,
  saveOfflineQueue,
  type OfflineQueueItem,
} from './offlineQueue';

type CallableFactory = typeof httpsCallable;

type QueueMeta = {
  technicianId?: string;
  ticketId: string;
  label?: string;
};

export type QueuedTechnicianJobAction = {
  schemaVersion: 1;
  functionName: 'acceptTechnicianTicket' | 'updateTicketLifecycle';
  payload: Record<string, any>;
  ticketId: string;
  technicianId?: string;
  queuedAt: string;
};

export type OfflineReplayResult = {
  attempted: number;
  replayed: number;
  failed: number;
  blocked: number;
  remaining: number;
};

const normalizedErrorCode = (err: any) => String(err?.code || '').toLowerCase().replace(/^functions\//, '');

export const shouldQueueOffline = (err: any) => {
  const code = normalizedErrorCode(err);
  const message = String(err?.message || '').toLowerCase();
  return (typeof navigator !== 'undefined' && !navigator.onLine)
    || ['unavailable', 'deadline-exceeded', 'internal', 'resource-exhausted'].includes(code)
    || message.includes('network')
    || message.includes('offline')
    || message.includes('failed to fetch');
};

function canonicalQueuePayload(params: {
  functionName: QueuedTechnicianJobAction['functionName'];
  payload: Record<string, any>;
  ticketId: string;
  technicianId?: string;
}): QueuedTechnicianJobAction {
  return {
    schemaVersion: 1,
    functionName: params.functionName,
    payload: params.payload,
    ticketId: params.ticketId,
    technicianId: params.technicianId,
    queuedAt: new Date().toISOString(),
  };
}

export function parseQueuedTechnicianJobAction(item: OfflineQueueItem): QueuedTechnicianJobAction | null {
  if (!item.payload) return null;
  try {
    const parsed = JSON.parse(item.payload) as Record<string, any>;
    if (
      parsed?.functionName &&
      parsed?.payload &&
      ['acceptTechnicianTicket', 'updateTicketLifecycle'].includes(String(parsed.functionName))
    ) {
      return {
        schemaVersion: 1,
        functionName: parsed.functionName,
        payload: parsed.payload,
        ticketId: String(parsed.ticketId || parsed.payload.ticketId || ''),
        technicianId: parsed.technicianId ? String(parsed.technicianId) : undefined,
        queuedAt: String(parsed.queuedAt || item.createdAt),
      } as QueuedTechnicianJobAction;
    }

    // Backward compatibility for the original TechnicianJobDetailPage flat payload.
    const ticketId = String(parsed?.ticketId || '');
    const status = String(parsed?.status || '').toUpperCase();
    if (!ticketId || !status) return null;
    if (status === 'ACCEPTED') {
      return canonicalQueuePayload({
        functionName: 'acceptTechnicianTicket',
        payload: { ticketId },
        ticketId,
        technicianId: parsed.technicianId ? String(parsed.technicianId) : undefined,
      });
    }
    return canonicalQueuePayload({
      functionName: 'updateTicketLifecycle',
      payload: {
        ticketId,
        status,
        notes: String(parsed.notes || ''),
      },
      ticketId,
      technicianId: parsed.technicianId ? String(parsed.technicianId) : undefined,
    });
  } catch {
    return null;
  }
}

export function isQueuedTechnicianActionAutoReplayable(action: QueuedTechnicianJobAction | null) {
  if (!action) return false;
  if (action.functionName === 'acceptTechnicianTicket') return true;
  const status = String(action.payload.status || '').toUpperCase();
  // Arrival needs fresh foreground GPS. Completion needs foreground photo upload.
  return ['EN_ROUTE', 'IN_PROGRESS'].includes(status);
}

function restorePendingOrFail(item: OfflineQueueItem, err: any) {
  const retryable = shouldQueueOffline(err);
  const current = loadOfflineQueue();
  const latest = current.find((candidate) => candidate.id === item.id);
  const attempts = latest?.attempts ?? item.attempts + 1;
  if (!retryable || attempts >= 3) {
    markOfflineQueueItemFailed(item.id);
    return;
  }
  saveOfflineQueue(current.map((candidate) => candidate.id === item.id
    ? { ...candidate, status: 'pending' as const, updatedAt: new Date().toISOString() }
    : candidate));
}

export async function replayOfflineJobAction(item: OfflineQueueItem, callableFactory: CallableFactory = httpsCallable) {
  const action = parseQueuedTechnicianJobAction(item);
  if (!isQueuedTechnicianActionAutoReplayable(action)) {
    return { replayed: false, blocked: true } as const;
  }
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { replayed: false, blocked: false, offline: true } as const;
  }

  markOfflineQueueItemRetrying(item.id);
  try {
    const callable = callableFactory(functions, action!.functionName);
    await callable(action!.payload);
    removeOfflineQueueItem(item.id);
    return { replayed: true, blocked: false } as const;
  } catch (err: any) {
    restorePendingOrFail(item, err);
    return { replayed: false, blocked: false, error: err } as const;
  }
}

let replayInFlight: Promise<OfflineReplayResult> | null = null;

export function replayEligibleOfflineJobActions(callableFactory: CallableFactory = httpsCallable): Promise<OfflineReplayResult> {
  if (replayInFlight) return replayInFlight;
  replayInFlight = (async () => {
    const items = [...loadOfflineQueue()].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let attempted = 0;
    let replayed = 0;
    let failed = 0;
    let blocked = 0;

    for (const item of items) {
      const action = parseQueuedTechnicianJobAction(item);
      if (!isQueuedTechnicianActionAutoReplayable(action)) {
        blocked += 1;
        continue;
      }
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      attempted += 1;
      const result = await replayOfflineJobAction(item, callableFactory);
      if (result.replayed) replayed += 1;
      else if (!result.blocked && 'error' in result) failed += 1;
    }

    return { attempted, replayed, failed, blocked, remaining: loadOfflineQueue().length };
  })().finally(() => {
    replayInFlight = null;
  });
  return replayInFlight;
}

export async function callJobActionWithOfflineQueue<TPayload extends Record<string, any>>(params: {
  callableFactory?: CallableFactory;
  functionName: QueuedTechnicianJobAction['functionName'];
  payload: TPayload;
  meta: QueueMeta;
}) {
  const callable = (params.callableFactory || httpsCallable)(functions, params.functionName);
  try {
    return await callable(params.payload);
  } catch (err: any) {
    if (!shouldQueueOffline(err)) throw err;
    const actionLabel = params.meta.label || params.functionName;
    enqueueOfflineQueueItem({
      type: 'job_action',
      label: actionLabel,
      detail: `${actionLabel} for mission #${String(params.meta.ticketId).slice(0, 8)} will sync automatically when connection returns.`,
      payload: JSON.stringify(canonicalQueuePayload({
        functionName: params.functionName,
        payload: params.payload,
        ticketId: params.meta.ticketId,
        technicianId: params.meta.technicianId,
      })),
    });
    return { queuedOffline: true } as any;
  }
}

export async function acceptJobWithOfflineQueue(ticketId: string, technicianId?: string) {
  return callJobActionWithOfflineQueue({
    functionName: 'acceptTechnicianTicket',
    payload: { ticketId },
    meta: { ticketId, technicianId, label: 'Accept mission' },
  });
}

export async function updateJobLifecycleWithOfflineQueue(params: { ticketId: string; technicianId?: string; status: string; notes?: string; materials?: string; localPhotoCount?: number }) {
  return callJobActionWithOfflineQueue({
    functionName: 'updateTicketLifecycle',
    payload: { ticketId: params.ticketId, status: params.status, notes: params.notes || '' },
    meta: { ticketId: params.ticketId, technicianId: params.technicianId, label: `Mission ${String(params.status).replace(/_/g, ' ')}` },
  });
}
