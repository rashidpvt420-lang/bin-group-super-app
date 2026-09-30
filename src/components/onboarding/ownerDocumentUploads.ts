// F-6 / F-9: Owner onboarding document uploads.
// - The server returns a Storage path (no permanent download-token URL); submission sends paths.
// - Transient failures (network, unavailable, deadline, internal) are retried with backoff.
// - A document already uploaded for this Owner + application with identical bytes (SHA-256) is not
//   uploaded again when the Owner retries submission.

export type OwnerDocumentInput = { key: string; file: Blob & { name?: string } };
export type OwnerDocumentUploadResult = { storagePath?: string; sha256?: string };
type StorageLike = { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void };

const NON_RETRYABLE = new Set([
  'invalid-argument', 'permission-denied', 'unauthenticated', 'failed-precondition', 'not-found', 'already-exists', 'out-of-range',
]);

export function isRetryableUploadError(error: unknown): boolean {
  const code = String((error as any)?.code || '').replace(/^functions\//, '');
  if (NON_RETRYABLE.has(code)) return false;
  return true; // unavailable, deadline-exceeded, internal, resource-exhausted, network/unknown
}

export async function withUploadRetry<T>(
  task: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number; sleep?: (ms: number) => Promise<void> } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = options.baseDelayMs ?? 800;
  const sleep = options.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryableUploadError(error)) throw error;
      await sleep(baseDelayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

export const uploadCacheKey = (uid: string, intakeId: string, key: string) => `bin-owner-doc-upload:${uid}:${intakeId}:${key}`;

export function clearOwnerDocumentUploadCache(cache: StorageLike | null, uid: string, intakeId: string, keys: string[]) {
  if (!cache) return;
  for (const key of keys) {
    try { cache.removeItem(uploadCacheKey(uid, intakeId, key)); } catch { /* storage unavailable */ }
  }
}

export async function uploadOwnerDocuments(options: {
  uid: string;
  intakeId: string;
  documents: OwnerDocumentInput[];
  upload: (document: OwnerDocumentInput) => Promise<OwnerDocumentUploadResult>;
  hash: (file: Blob) => Promise<string>;
  cache: StorageLike | null;
  sleep?: (ms: number) => Promise<void>;
  onProgress?: (key: string, percent: number) => void;
}): Promise<Record<string, string>> {
  const paths: Record<string, string> = {};
  const ownerPrefix = `onboarding-proof/${options.uid}/`;
  for (const document of options.documents) {
    const digest = await options.hash(document.file);
    const cacheKey = uploadCacheKey(options.uid, options.intakeId, document.key);
    let cached: { sha256?: string; storagePath?: string } | null = null;
    try { cached = JSON.parse(options.cache?.getItem(cacheKey) || 'null'); } catch { cached = null; }
    if (cached?.sha256 === digest && String(cached.storagePath || '').startsWith(ownerPrefix)) {
      paths[document.key] = String(cached.storagePath);
      options.onProgress?.(document.key, 100);
      continue;
    }
    options.onProgress?.(document.key, 20);
    const uploaded = await withUploadRetry(() => options.upload(document), { sleep: options.sleep });
    const storagePath = String(uploaded?.storagePath || '');
    if (!storagePath.startsWith(ownerPrefix)) {
      throw Object.assign(new Error(`Secure upload failed for ${document.key}.`), { code: 'upload-path-missing', documentKey: document.key });
    }
    paths[document.key] = storagePath;
    try { options.cache?.setItem(cacheKey, JSON.stringify({ sha256: digest, storagePath })); } catch { /* storage unavailable */ }
    options.onProgress?.(document.key, 100);
  }
  return paths;
}
