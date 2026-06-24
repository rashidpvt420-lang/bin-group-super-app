import { httpsCallable } from '../../lib/firebase';
import { enqueueOfflineQueueItem } from './offlineQueue';

type CallableFactory = typeof httpsCallable;

type QueueMeta = {
  technicianId?: string;
  ticketId: string;
  label?: string;
};

const shouldQueueOffline = (err: any) => {
  const code = String(err?.code || '').toLowerCase();
  const message = String(err?.message || '').toLowerCase();
  return (typeof navigator !== 'undefined' && !navigator.onLine)
    || ['unavailable', 'deadline-exceeded', 'internal'].includes(code)
    || message.includes('network')
    || message.includes('offline');
};

export async function callJobActionWithOfflineQueue<TPayload extends Record<string, any>>(params: {
  callableFactory?: CallableFactory;
  functionName: string;
  payload: TPayload;
  meta: QueueMeta;
}) {
  const callable = (params.callableFactory || httpsCallable)(params.functionName);
  try {
    return await callable(params.payload);
  } catch (err: any) {
    if (!shouldQueueOffline(err)) throw err;
    const actionLabel = params.meta.label || params.functionName;
    enqueueOfflineQueueItem({
      type: 'job_action',
      label: actionLabel,
      detail: `${actionLabel} for mission #${String(params.meta.ticketId).slice(0, 8)} will need sync/review when connection returns.`,
      payload: JSON.stringify({
        functionName: params.functionName,
        payload: params.payload,
        ticketId: params.meta.ticketId,
        technicianId: params.meta.technicianId,
        queuedAt: new Date().toISOString(),
      }),
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
