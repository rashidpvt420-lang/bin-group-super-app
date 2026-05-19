// apps/owner-app/src/lib/offlineSync.ts
import { db, doc, updateDoc, storage, ref, uploadBytes, getDownloadURL, serverTimestamp } from './firebase';

export interface QueuedMutation {
    id: string;
    targetCollection: string;
    docId: string;
    data: any;
    timestamp: number;
}

export interface QueuedAttachment {
    id: string;
    ticketId: string;
    field: string;
    blob: Blob | string; // base64 if string
    fileName: string;
    timestamp: number;
}

const DB_NAME = 'BinSovereignDB';
const MUTATION_STORE = 'mutation_queue';
const ATTACHMENT_STORE = 'attachment_queue';

const getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 3);
        request.onupgradeneeded = () => {
            const db = request.result;
            if (!db.objectStoreNames.contains(MUTATION_STORE)) {
                db.createObjectStore(MUTATION_STORE, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
                db.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
            }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
    });
};

export const queueMutation = async (collection: string, docId: string, data: any): Promise<boolean> => {
    try {
        const db_idb = await getDB();
        const tx = db_idb.transaction(MUTATION_STORE, 'readwrite');
        const store = tx.objectStore(MUTATION_STORE);

        const mutation: QueuedMutation = {
            id: `${docId}_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            targetCollection: collection,
            docId,
            data: { ...data, pending_sync: true, local_timestamp: Date.now() },
            timestamp: Date.now()
        };

        return new Promise((resolve) => {
            const request = store.add(mutation);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    } catch (err) {
        return false;
    }
};

export const queueAttachment = async (ticketId: string, field: string, blob: Blob | string, fileName: string): Promise<boolean> => {
    try {
        const db_idb = await getDB();
        const tx = db_idb.transaction(ATTACHMENT_STORE, 'readwrite');
        const store = tx.objectStore(ATTACHMENT_STORE);

        const attachment: QueuedAttachment = {
            id: `${ticketId}_${field}_${Date.now()}`,
            ticketId,
            field,
            blob,
            fileName,
            timestamp: Date.now()
        };

        return new Promise((resolve) => {
            const request = store.add(attachment);
            request.onsuccess = () => resolve(true);
            request.onerror = () => resolve(false);
        });
    } catch (err) {
        return false;
    }
};

export const processQueues = async () => {
    if (!navigator.onLine) return;

    const db_idb = await getDB();

    // 1. Process Mutations
    const mutationTx = db_idb.transaction(MUTATION_STORE, 'readonly');
    const mutations: QueuedMutation[] = await new Promise((resolve) => {
        const request = mutationTx.objectStore(MUTATION_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
    });

    for (const m of mutations) {
        try {
            const { pending_sync, local_timestamp, ...actualData } = m.data;
            await updateDoc(doc(db, m.targetCollection, m.docId), { 
                ...actualData, 
                syncedAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            const delTx = db_idb.transaction(MUTATION_STORE, 'readwrite');
            delTx.objectStore(MUTATION_STORE).delete(m.id);
        } catch (e) {
            console.error("[Offline Sync] Mutation Failed:", e);
        }
    }

    // 2. Process Attachments
    const attachTx = db_idb.transaction(ATTACHMENT_STORE, 'readonly');
    const attachments: QueuedAttachment[] = await new Promise((resolve) => {
        const request = attachTx.objectStore(ATTACHMENT_STORE).getAll();
        request.onsuccess = () => resolve(request.result);
    });

    for (const a of attachments) {
        try {
            const storageRef = ref(storage, `evidence/${a.ticketId}/${a.fileName}`);
            let blobToUpload = a.blob;
            
            if (typeof a.blob === 'string' && a.blob.startsWith('data:')) {
                const res = await fetch(a.blob);
                blobToUpload = await res.blob();
            }

            await uploadBytes(storageRef, blobToUpload as Blob);
            const url = await getDownloadURL(storageRef);
            await updateDoc(doc(db, 'maintenanceTickets', a.ticketId), { 
                [a.field]: true, 
                [`${a.field}Url`]: url, 
                [`${a.field}Pending`]: false,
                updatedAt: serverTimestamp() 
            });

            const delTx = db_idb.transaction(ATTACHMENT_STORE, 'readwrite');
            delTx.objectStore(ATTACHMENT_STORE).delete(a.id);
        } catch (e) {
            console.error("[Offline Sync] Attachment Failed:", e);
        }
    }
};

if (typeof window !== 'undefined') {
    window.addEventListener('online', processQueues);
    processQueues();
}
