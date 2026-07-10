import { functions, httpsCallable } from '../lib/firebase';

export interface AuditLog {
    actorId?: string;
    actorRole?: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
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
    } catch (error) {
        // Audit logging is protected and server-authoritative, but remains
        // non-blocking so a telemetry outage cannot corrupt a business action.
        console.warn('[AUDIT] logAuditAction failed (non-blocking):', error);
    }
};
