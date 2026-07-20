import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface AuditLog {
    actorId: string;
    actorRole: string;
    action: string;
    targetType: string;
    targetId: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
    metadata?: Record<string, unknown>;
    userAgent?: string;
}

const auditValue = (value: unknown) => {
    if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value;
    }
    try {
        return JSON.stringify(value);
    } catch {
        return String(value ?? '');
    }
};

export const logAuditAction = async (log: AuditLog) => {
    try {
        const logUserAuditAction = httpsCallable(functions, 'logUserAuditAction');
        const metadata: Record<string, string | number | boolean | null> = {
            actorRoleHint: log.actorRole,
            userAgent: log.userAgent || (typeof navigator !== 'undefined' ? navigator.userAgent : 'SYSTEM'),
        };
        if (log.reason) metadata.reason = log.reason;
        if (log.before !== undefined) metadata.before = String(auditValue(log.before));
        if (log.after !== undefined) metadata.after = String(auditValue(log.after));
        for (const [key, value] of Object.entries(log.metadata || {})) {
            const normalized = auditValue(value);
            metadata[key] = normalized === null || ['string', 'number', 'boolean'].includes(typeof normalized)
                ? normalized as string | number | boolean | null
                : String(normalized);
        }
        await logUserAuditAction({
            action: log.action,
            targetType: log.targetType,
            targetId: log.targetId,
            metadata,
        });
    } catch (error) {
        console.error('Critical Audit Log Failure:', error);
    }
};
