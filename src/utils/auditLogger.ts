import { db, collection, addDoc, serverTimestamp } from '../lib/firebase';

export interface AuditLog {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: any;
    after?: any;
    metadata?: any;
    userAgent?: string;
}

export const logAuditAction = async (log: AuditLog) => {
    try {
        await addDoc(collection(db, 'audit_logs'), {
            ...log,
            userAgent: log.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM'),
            createdAt: serverTimestamp()
        });
    } catch (err) {
        console.error("Critical Audit Log Failure:", err);
    }
};
