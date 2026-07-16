const DB_NAME = 'bin-onboarding-db';
const STORE_NAME = 'staged-proofs';
const DB_VERSION = 2;
const KEY_STORAGE_NAME = 'bin-onboarding-aes-key-v1';
const RECORD_VERSION = 2;
const AES_KEY_BITS = 256;
const AES_GCM_IV_BYTES = 12;

interface EncryptedStagedFileRecord {
    version: typeof RECORD_VERSION;
    algorithm: 'AES-GCM';
    iv: Uint8Array;
    ciphertext: ArrayBuffer;
    name: string;
    type: string;
    lastModified: number;
    size: number;
    createdAt: number;
}

const textEncoder = new TextEncoder();

const bytesToBase64 = (bytes: Uint8Array) => {
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    return btoa(binary);
};

const base64ToBytes = (value: string) => {
    const binary = atob(value);
    return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const requireCrypto = () => {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Secure browser encryption is unavailable. Use a modern browser and try again.');
    }
    return globalThis.crypto;
};

const importSessionKey = async (encodedKey: string) => {
    const cryptoApi = requireCrypto();
    return cryptoApi.subtle.importKey(
        'raw',
        base64ToBytes(encodedKey),
        { name: 'AES-GCM', length: AES_KEY_BITS },
        false,
        ['encrypt', 'decrypt'],
    );
};

const getOrCreateSessionKey = async () => {
    const cryptoApi = requireCrypto();
    const existing = sessionStorage.getItem(KEY_STORAGE_NAME);
    if (existing) return importSessionKey(existing);

    const key = await cryptoApi.subtle.generateKey(
        { name: 'AES-GCM', length: AES_KEY_BITS },
        true,
        ['encrypt', 'decrypt'],
    );
    const rawKey = new Uint8Array(await cryptoApi.subtle.exportKey('raw', key));
    sessionStorage.setItem(KEY_STORAGE_NAME, bytesToBase64(rawKey));
    rawKey.fill(0);
    return key;
};

const isEncryptedRecord = (value: unknown): value is EncryptedStagedFileRecord => {
    if (!value || typeof value !== 'object') return false;
    const record = value as Partial<EncryptedStagedFileRecord>;
    return record.version === RECORD_VERSION &&
        record.algorithm === 'AES-GCM' &&
        record.iv instanceof Uint8Array &&
        record.ciphertext instanceof ArrayBuffer &&
        typeof record.name === 'string' &&
        typeof record.type === 'string' &&
        typeof record.lastModified === 'number';
};

const requestResult = <T>(request: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB request failed.'));
});

export function openOnboardingDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error('Unable to open secure onboarding storage.'));
        request.onblocked = () => reject(new Error('Secure onboarding storage upgrade is blocked by another open tab.'));
    });
}

const readStoredValue = async (key: string): Promise<unknown> => {
    const db = await openOnboardingDb();
    try {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        return await requestResult(transaction.objectStore(STORE_NAME).get(key));
    } finally {
        db.close();
    }
};

export async function stageFile(key: string, file: File): Promise<void> {
    const cryptoApi = requireCrypto();
    const encryptionKey = await getOrCreateSessionKey();
    const iv = cryptoApi.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
    const plaintext = await file.arrayBuffer();
    const ciphertext = await cryptoApi.subtle.encrypt(
        {
            name: 'AES-GCM',
            iv,
            additionalData: textEncoder.encode(key),
            tagLength: 128,
        },
        encryptionKey,
        plaintext,
    );

    const record: EncryptedStagedFileRecord = {
        version: RECORD_VERSION,
        algorithm: 'AES-GCM',
        iv,
        ciphertext,
        name: file.name,
        type: file.type || 'application/octet-stream',
        lastModified: file.lastModified,
        size: file.size,
        createdAt: Date.now(),
    };

    const db = await openOnboardingDb();
    try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(transaction.objectStore(STORE_NAME).put(record, key));
    } finally {
        db.close();
    }
}

export async function getStagedFile(key: string): Promise<File | null> {
    const stored = await readStoredValue(key);
    if (!stored) return null;

    // Migrate legacy plaintext File/Blob records immediately on first access.
    if (stored instanceof Blob) {
        const legacyFile = stored instanceof File
            ? stored
            : new File([stored], `${key}.bin`, { type: stored.type || 'application/octet-stream' });
        await stageFile(key, legacyFile);
        return legacyFile;
    }

    if (!isEncryptedRecord(stored)) {
        await removeStagedFile(key);
        throw new Error('An unsupported onboarding document record was removed. Upload the document again.');
    }

    try {
        const cryptoApi = requireCrypto();
        const decryptionKey = await getOrCreateSessionKey();
        const plaintext = await cryptoApi.subtle.decrypt(
            {
                name: 'AES-GCM',
                iv: stored.iv,
                additionalData: textEncoder.encode(key),
                tagLength: 128,
            },
            decryptionKey,
            stored.ciphertext,
        );
        return new File([plaintext], stored.name, {
            type: stored.type,
            lastModified: stored.lastModified,
        });
    } catch {
        await removeStagedFile(key);
        throw new Error('The protected onboarding document could not be authenticated and was removed. Upload it again.');
    }
}

export async function removeStagedFile(key: string): Promise<void> {
    const db = await openOnboardingDb();
    try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(transaction.objectStore(STORE_NAME).delete(key));
    } finally {
        db.close();
    }
}

export function clearOnboardingEncryptionKey(): void {
    sessionStorage.removeItem(KEY_STORAGE_NAME);
}

export async function clearStagedFiles(): Promise<void> {
    const db = await openOnboardingDb();
    try {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        await requestResult(transaction.objectStore(STORE_NAME).clear());
    } finally {
        db.close();
        clearOnboardingEncryptionKey();
    }
}

export async function clearOnboardingSessionArtifacts(): Promise<void> {
    try {
        await clearStagedFiles();
    } finally {
        localStorage.removeItem('bin-group-onboarding-v3');
        sessionStorage.removeItem(KEY_STORAGE_NAME);
    }
}
