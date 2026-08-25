import {
  functions,
  getDownloadURL,
  httpsCallable,
  ref,
  storage,
  uploadBytes,
} from '../../lib/firebase';

export type TechnicianEvidenceKind = 'before_work';
export type TechnicianEvidenceQueueStatus = 'pending' | 'retrying' | 'failed';

export type TechnicianEvidenceQueueItem = {
  id: string;
  ticketId: string;
  technicianId: string;
  kind: TechnicianEvidenceKind;
  blob: Blob;
  fileName: string;
  contentType: string;
  storagePath: string;
  status: TechnicianEvidenceQueueStatus;
  attempts: number;
  createdAt: string;
  updatedAt: string;
  lastErrorCode?: string;
};

export type TechnicianEvidenceReplayResult = {
  attempted: number;
  replayed: number;
  failed: number;
  remaining: number;
};

const DB_NAME = 'BinTechnicianEvidenceDB';
const DB_VERSION = 1;
const STORE_NAME = 'evidence_queue';
const MAX_ATTEMPTS = 5;
const QUEUE_EVENT = 'bin-technician-evidence-queue-updated';

const errorCode = (error: any) => String(error?.code || error?.name || 'unknown').toLowerCase();

export const isRetryableTechnicianEvidenceError = (error: any) => {
  const code = errorCode(error);
  const message = String(error?.message || '').toLowerCase();
  return (typeof navigator !== 'undefined' && !navigator.onLine)
    || ['storage/unknown', 'storage/retry-limit-exceeded', 'storage/server-file-wrong-size', 'unavailable', 'deadline-exceeded', 'internal'].some((value) => code.includes(value))
    || message.includes('network')
    || message.includes('failed to fetch')
    || message.includes('timeout')
    || message.includes('connection');
};

const openQueueDb = () => new Promise<IDBDatabase>((resolve, reject) => {
  if (typeof indexedDB === 'undefined') {
    reject(new Error('IndexedDB is unavailable; photo evidence cannot be saved for offline sync.'));
    return;
  }
  const request = indexedDB.open(DB_NAME, DB_VERSION);
  request.onupgradeneeded = () => {
    const database = request.result;
    if (!database.objectStoreNames.contains(STORE_NAME)) {
      const store = database.createObjectStore(STORE_NAME, { keyPath: 'id' });
      store.createIndex('createdAt', 'createdAt', { unique: false });
      store.createIndex('ticketId', 'ticketId', { unique: false });
    }
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Technician evidence queue could not be opened.'));
});

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error || new Error('Technician evidence queue request failed.'));
});

const notifyQueueChanged = async () => {
  if (typeof window === 'undefined') return;
  const count = await getTechnicianEvidenceQueueCount().catch(() => 0);
  window.dispatchEvent(new CustomEvent(QUEUE_EVENT, { detail: { count } }));
};

async function putItem(item: TechnicianEvidenceQueueItem) {
  const database = await openQueueDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).put(item));
  } finally {
    database.close();
  }
}

async function deleteItem(id: string) {
  const database = await openQueueDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    await requestResult(transaction.objectStore(STORE_NAME).delete(id));
  } finally {
    database.close();
  }
}

export async function listTechnicianEvidenceQueue(): Promise<TechnicianEvidenceQueueItem[]> {
  const database = await openQueueDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const items = await requestResult(transaction.objectStore(STORE_NAME).getAll()) as TechnicianEvidenceQueueItem[];
    return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } finally {
    database.close();
  }
}

export async function getTechnicianEvidenceQueueCount() {
  const database = await openQueueDb();
  try {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    return await requestResult(transaction.objectStore(STORE_NAME).count());
  } finally {
    database.close();
  }
}

export async function queueTechnicianEvidence(params: {
  ticketId: string;
  technicianId: string;
  kind: TechnicianEvidenceKind;
  blob: Blob;
  fileName: string;
  contentType: string;
  storagePath: string;
}) {
  if (!params.ticketId || !params.technicianId || !params.storagePath) {
    throw new Error('Technician evidence queue requires ticket, technician and Storage path.');
  }
  if (!(params.blob instanceof Blob) || params.blob.size <= 0) {
    throw new Error('Technician evidence queue requires a non-empty photo.');
  }

  const now = new Date().toISOString();
  const item: TechnicianEvidenceQueueItem = {
    id: `evidence_${params.ticketId}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    ticketId: params.ticketId,
    technicianId: params.technicianId,
    kind: params.kind,
    blob: params.blob,
    fileName: params.fileName,
    contentType: params.contentType || 'image/jpeg',
    storagePath: params.storagePath,
    status: 'pending',
    attempts: 0,
    createdAt: now,
    updatedAt: now,
  };
  await putItem(item);
  await notifyQueueChanged();
  return item;
}

async function confirmUploadedEvidence(item: TechnicianEvidenceQueueItem, downloadUrl: string) {
  const submitEvidence = httpsCallable(functions, 'submitTechnicianBeforeWorkEvidence');
  await submitEvidence({
    ticketId: item.ticketId,
    storagePath: item.storagePath,
    downloadUrl,
  });
}

export async function replayTechnicianEvidenceItem(item: TechnicianEvidenceQueueItem) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    return { replayed: false, offline: true } as const;
  }

  const retrying: TechnicianEvidenceQueueItem = {
    ...item,
    status: 'retrying',
    attempts: item.attempts + 1,
    updatedAt: new Date().toISOString(),
    lastErrorCode: undefined,
  };
  await putItem(retrying);

  try {
    const objectRef = ref(storage, retrying.storagePath);
    await uploadBytes(objectRef, retrying.blob, {
      contentType: retrying.contentType,
      customMetadata: {
        ticketId: retrying.ticketId,
        technicianId: retrying.technicianId,
        evidenceType: 'technician_before_work',
        queueId: retrying.id,
      },
    });
    const downloadUrl = await getDownloadURL(objectRef);
    await confirmUploadedEvidence(retrying, downloadUrl);
    await deleteItem(retrying.id);
    await notifyQueueChanged();
    return { replayed: true } as const;
  } catch (error: any) {
    const retryable = isRetryableTechnicianEvidenceError(error);
    const failed = !retryable || retrying.attempts >= MAX_ATTEMPTS;
    await putItem({
      ...retrying,
      status: failed ? 'failed' : 'pending',
      updatedAt: new Date().toISOString(),
      lastErrorCode: errorCode(error),
    });
    await notifyQueueChanged();
    return { replayed: false, error, failed } as const;
  }
}

let replayInFlight: Promise<TechnicianEvidenceReplayResult> | null = null;

export function replayTechnicianEvidenceQueue(): Promise<TechnicianEvidenceReplayResult> {
  if (replayInFlight) return replayInFlight;
  replayInFlight = (async () => {
    const items = await listTechnicianEvidenceQueue();
    let attempted = 0;
    let replayed = 0;
    let failed = 0;

    for (const item of items) {
      if (typeof navigator !== 'undefined' && !navigator.onLine) break;
      if (item.status === 'failed' && item.attempts >= MAX_ATTEMPTS) {
        failed += 1;
        continue;
      }
      attempted += 1;
      const result = await replayTechnicianEvidenceItem(item);
      if (result.replayed) replayed += 1;
      else if ('failed' in result && result.failed) failed += 1;
    }

    return {
      attempted,
      replayed,
      failed,
      remaining: await getTechnicianEvidenceQueueCount().catch(() => 0),
    };
  })().finally(() => {
    replayInFlight = null;
  });
  return replayInFlight;
}

export const TECHNICIAN_EVIDENCE_QUEUE_EVENT = QUEUE_EVENT;
