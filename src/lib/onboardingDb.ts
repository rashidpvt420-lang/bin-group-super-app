const DB_NAME = 'bin-onboarding-db';
const STORE_NAME = 'staged-proofs';
const KEY_NAME = 'onboarding_session_crypto_key';

export function openOnboardingDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
}

async function getOrCreateSessionKey(): Promise<CryptoKey> {
    const stored = sessionStorage.getItem(KEY_NAME);
    if (stored) {
        const rawKey = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
        return crypto.subtle.importKey(
            'raw',
            rawKey,
            { name: 'AES-GCM' },
            false,
            ['encrypt', 'decrypt']
        );
    }
    const newKey = await crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true,
        ['encrypt', 'decrypt']
    );
    const exported = await crypto.subtle.exportKey('raw', newKey);
    const binary = String.fromCharCode(...new Uint8Array(exported));
    sessionStorage.setItem(KEY_NAME, btoa(binary));
    return newKey;
}

interface EncryptedFilePayload {
    ciphertext: ArrayBuffer;
    iv: Uint8Array;
    name: string;
    type: string;
}

export async function stageFile(key: string, file: File): Promise<void> {
    const db = await openOnboardingDb();

    // Encrypt the file using Web Crypto with session key
    const keyObj = await getOrCreateSessionKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = await file.arrayBuffer();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        keyObj,
        plaintext
    );

    const payload: EncryptedFilePayload = {
        ciphertext,
        iv,
        name: file.name,
        type: file.type
    };

    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(payload, key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function getStagedFile(key: string): Promise<File | null> {
    const db = await openOnboardingDb();
    const payload: EncryptedFilePayload | null = await new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readonly');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(key);
        request.onsuccess = () => resolve(request.result || null);
        request.onerror = () => reject(request.error);
    });

    if (!payload) return null;

    try {
        const keyObj = await getOrCreateSessionKey();
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: payload.iv as BufferSource },
            keyObj,
            payload.ciphertext
        );
        return new File([plaintext], payload.name, { type: payload.type });
    } catch (err) {
        console.error('Failed to decrypt staged file:', err);
        return null;
    }
}

export async function removeStagedFile(key: string): Promise<void> {
    const db = await openOnboardingDb();
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.delete(key);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}

export async function clearStagedFiles(): Promise<void> {
    const db = await openOnboardingDb();
    sessionStorage.removeItem(KEY_NAME); // Also clear the crypto key!
    return new Promise((resolve, reject) => {
        const transaction = db.transaction(STORE_NAME, 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.clear();
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
    });
}
