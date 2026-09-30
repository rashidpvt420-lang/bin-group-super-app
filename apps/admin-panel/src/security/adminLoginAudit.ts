// N-17: Admin login audit is written by the server. Browser SDKs are denied on audit_logs by
// Firestore rules (by design), so the previous client addDoc() never recorded anything and the
// failure was swallowed as a console warning. registerAdminSecuritySession writes both the
// admin_security_sessions record and the audit_logs entry with server-derived MFA facts.

export const ADMIN_SECURITY_SESSION_STORAGE_KEY = 'bin-admin-security-session';

export type AdminLoginAuditResult = {
    recorded: boolean;
    sessionId: string | null;
    errorCode?: string;
};

type Callable = (data?: unknown) => Promise<{ data?: unknown }>;
type SessionStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const errorCodeOf = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        return String((error as { code?: unknown }).code || 'unknown');
    }
    return error instanceof Error ? error.message || 'unknown' : 'unknown';
};

export async function recordAdminLoginAudit(
    registerAdminSecuritySession: Callable,
    options: { language?: string; storage?: SessionStore | null; logger?: Pick<Console, 'error'> } = {},
): Promise<AdminLoginAuditResult> {
    const logger = options.logger || console;
    const language = String(options.language || 'en').slice(0, 12);
    let lastError: unknown = null;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        try {
            const response = await registerAdminSecuritySession({ language });
            const sessionId = String((response?.data as { sessionId?: unknown } | undefined)?.sessionId || '');
            if (!sessionId) throw new Error('ADMIN_SECURITY_SESSION_MISSING');
            options.storage?.setItem(ADMIN_SECURITY_SESSION_STORAGE_KEY, sessionId);
            return { recorded: true, sessionId };
        } catch (error) {
            lastError = error;
        }
    }
    options.storage?.removeItem(ADMIN_SECURITY_SESSION_STORAGE_KEY);
    const errorCode = errorCodeOf(lastError);
    logger.error('[ADMIN-AUTH] Server login audit was NOT recorded (registerAdminSecuritySession failed):', errorCode);
    return { recorded: false, sessionId: null, errorCode };
}

export function clearAdminSecuritySession(storage?: SessionStore | null) {
    storage?.removeItem(ADMIN_SECURITY_SESSION_STORAGE_KEY);
}
