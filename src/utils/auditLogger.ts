/**
 * auditLogger.ts — Server-side audit bridge
 *
 * All audit entries are written exclusively by the `logUserAuditAction`
 * Cloud Function (europe-west3). Direct client writes to `audit_logs` /
 * `auditLogs` are blocked by Firestore Security Rules.
 */
import { functions, httpsCallable } from '../lib/firebase';

export interface AuditLog {
    actorId?: string;    // resolved server-side from auth token
    actorRole?: string;  // resolved server-side from user doc
    action: string;
    targetType: string;
    targetId: string;
    before?: any;
    after?: any;
    metadata?: any;
    userAgent?: string;
}

export const logAuditAction = async (log: AuditLog): Promise<void> => {
    try {
        const logUserAuditAction = httpsCallable(functions, 'logUserAuditAction');
        await logUserAuditAction({
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            metadata: {
                ...(log.metadata || {}),
                ...(log.before !== undefined ? { before: log.before } : {}),
                ...(log.after !== undefined ? { after: log.after } : {}),
                userAgent: log.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM'),
            },
        });
    } catch (err) {
        // Non-blocking: audit failures must never interrupt the user flow.
        console.warn('[AUDIT] logAuditAction failed (non-blocking):', err);
    }
};
