import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getIdTokenResult, multiFactor, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, auth, collection, db, doc, getDoc, onAuthStateChanged, serverTimestamp } from '../lib/firebase';

interface AuthContextType {
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
    user: any;
    mfaEnrollmentRequired: boolean;
    mfaVerified: boolean;
    mfaFactorCount: number;
    login: (credentials: { email: string; password: string }) => Promise<void>;
    logout: () => Promise<void>;
    status: 'idle' | 'restoring-session' | 'verifying-token' | 'verifying-profile' | 'awaiting-mfa' | 'authorized' | 'failed';
}

type AuthStatus = AuthContextType['status'];
type VerificationAttempt = {
    id: number;
    uid: string;
    timer: number | null;
    cancelled: boolean;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_ROLES = new Set([
    'admin', 'super_admin', 'ceo', 'manager', 'operations_admin',
    'finance_admin', 'hr_admin', 'support_admin',
]);

const STAFF_ROLES = new Set([
    'hr_manager', 'hr_staff', 'finance_staff', 'account_manager',
    'dispatcher', 'operations_manager',
]);

const roleFrom = (source: Record<string, unknown> | null | undefined) => String(
    source?.role || source?.userRole || source?.primaryRole || '',
).trim().toLowerCase();

const claimsGrantAdmin = (claims: Record<string, unknown>) => {
    const role = roleFrom(claims);
    return Boolean(
        claims.admin === true || claims.isAdmin === true || claims.ceo === true ||
        claims.manager === true || ADMIN_ROLES.has(role)
    );
};

const secondFactorFromClaims = (claims: Record<string, unknown>) => {
    const firebaseClaims = claims.firebase && typeof claims.firebase === 'object'
        ? claims.firebase as Record<string, unknown>
        : {};
    return String(
        firebaseClaims.sign_in_second_factor || claims.sign_in_second_factor || '',
    ).trim();
};

const timeout = <T,>(promise: Promise<T>, ms: number, code: string): Promise<T> => Promise.race([
    promise,
    new Promise<T>((_, reject) => window.setTimeout(() => reject(new Error(code)), ms)),
]);

const stripBridgeHash = (key: 'bridge_token' | 'sso_failed') => {
    if (typeof window === 'undefined') return;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    hashParams.delete(key);
    const remainingHash = hashParams.toString();
    const cleanUrl = `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
};

const shouldBlockForInitialAuth = () => typeof window === 'undefined' || window.location.pathname !== '/login';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [status, setStatusState] = useState<AuthStatus>(shouldBlockForInitialAuth() ? 'restoring-session' : 'idle');
    const statusRef = React.useRef(status);
    const setStatus = (newStatus: AuthStatus) => {
        statusRef.current = newStatus;
        setStatusState(newStatus);
    };

    const loading = status === 'restoring-session' || status === 'verifying-token' || status === 'verifying-profile';
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
    const [mfaVerified, setMfaVerified] = useState(false);
    const [mfaFactorCount, setMfaFactorCount] = useState(0);

    useEffect(() => {
        let mounted = true;
        let authHandshakeResolved = false;
        let verificationGeneration = 0;
        let activeAttempt: VerificationAttempt | null = null;

        const markAuthReady = () => {
            if (!mounted || authHandshakeResolved) return;
            authHandshakeResolved = true;
            const bootWindow = window as typeof window & { __BIN_GROUPS_BOOT__?: Record<string, unknown> };
            bootWindow.__BIN_GROUPS_BOOT__ = {
                ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
                authReady: true,
            };
        };

        const resetMfaState = () => {
            setMfaEnrollmentRequired(false);
            setMfaVerified(false);
            setMfaFactorCount(0);
        };

        const invalidateActiveAttempt = () => {
            verificationGeneration += 1;
            if (activeAttempt) {
                activeAttempt.cancelled = true;
                if (activeAttempt.timer !== null) window.clearTimeout(activeAttempt.timer);
                activeAttempt.timer = null;
            }
            activeAttempt = null;
        };

        const isCurrentAttempt = (attempt: VerificationAttempt) => Boolean(
            mounted && !attempt.cancelled && activeAttempt === attempt &&
            verificationGeneration === attempt.id && attempt.uid.length > 0
        );

        const mutateIfCurrent = (attempt: VerificationAttempt, mutation: () => void) => {
            if (!isCurrentAttempt(attempt)) return false;
            mutation();
            return true;
        };

        const verifyAdminUser = async (firebaseUser: any, attempt: VerificationAttempt) => {
            if (!mutateIfCurrent(attempt, () => setStatus('verifying-token'))) throw new Error('STALE_AUTH_ATTEMPT');
            console.log('[ADMIN-AUTH] token verification started');
            const idTokenResult = await timeout(getIdTokenResult(firebaseUser, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            if (!isCurrentAttempt(attempt)) throw new Error('STALE_AUTH_ATTEMPT');
            console.log('[ADMIN-AUTH] token verification completed');

            const claims = (idTokenResult.claims || {}) as Record<string, unknown>;
            const claimRole = roleFrom(claims);
            const claimsAdmin = claimsGrantAdmin(claims);
            let profile: Record<string, unknown> | null = null;
            let profileReadError: unknown = null;

            if (!mutateIfCurrent(attempt, () => setStatus('verifying-profile'))) throw new Error('STALE_AUTH_ATTEMPT');
            console.log('[ADMIN-AUTH] profile verification started');
            try {
                const userDoc = await timeout(getDoc(doc(db, 'users', firebaseUser.uid)), 8000, 'ADMIN_PROFILE_TIMEOUT');
                if (!isCurrentAttempt(attempt)) throw new Error('STALE_AUTH_ATTEMPT');
                profile = userDoc.exists() ? (userDoc.data() as Record<string, unknown>) : null;
                console.log('[ADMIN-AUTH] profile verification completed');
            } catch (profileError: any) {
                if (!isCurrentAttempt(attempt)) throw new Error('STALE_AUTH_ATTEMPT');
                profileReadError = profileError;
                console.warn('[ADMIN-AUTH] Profile lookup failed; claims remain authoritative:', profileError);
                if (profileError?.message === 'ADMIN_PROFILE_TIMEOUT') throw profileError;
            }

            const isAdmin = claimsAdmin;
            const isStaff = STAFF_ROLES.has(claimRole);
            if (!isAdmin && !isStaff) {
                if (profileReadError && !claimRole) throw new Error('ADMIN_PROFILE_LOOKUP_FAILED');
                throw new Error('INVALID_ADMIN_CLAIMS');
            }

            const factors = multiFactor(firebaseUser).enrolledFactors;
            const factorCount = factors.length;
            const secondFactor = secondFactorFromClaims(claims);
            const enrollmentRequired = factorCount === 0;
            const verifiedSecondFactor = factorCount > 0 && Boolean(secondFactor);
            if (factorCount > 0 && !verifiedSecondFactor) throw new Error('ADMIN_MFA_REQUIRED');
            if (!isCurrentAttempt(attempt)) throw new Error('STALE_AUTH_ATTEMPT');

            await addDoc(collection(db, 'audit_logs'), {
                actorId: firebaseUser.uid,
                actorRole: claimRole,
                targetType: 'system',
                targetId: 'admin-panel',
                action: enrollmentRequired ? 'ADMIN_LOGIN_MFA_ENROLLMENT_REQUIRED' : 'ADMIN_LOGIN_MFA_VERIFIED',
                mfaFactorCount: factorCount,
                mfaSecondFactorPresent: verifiedSecondFactor,
                userAgent: navigator.userAgent,
                createdAt: serverTimestamp(),
            }).catch((auditError) => console.warn('[ADMIN-AUTH] Audit log write skipped:', auditError));

            if (!isCurrentAttempt(attempt)) throw new Error('STALE_AUTH_ATTEMPT');
            return {
                ...firebaseUser,
                ...profile,
                role: claimRole,
                isAdmin,
                claims,
                mfaEnrollmentRequired: enrollmentRequired,
                mfaVerified: verifiedSecondFactor,
                mfaFactorCount: factorCount,
            };
        };

        if (typeof window !== 'undefined') {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const bridgeToken = hashParams.get('bridge_token');
            const ssoFailed = hashParams.get('sso_failed');
            if (bridgeToken) {
                stripBridgeHash('bridge_token');
                void timeout(signInWithCustomToken(auth, bridgeToken), 10000, 'BRIDGE_TOKEN_TIMEOUT')
                    .catch((bridgeError) => {
                        console.warn('[ADMIN-AUTH] Bridge token exchange failed:', bridgeError);
                        if (mounted) setError('Single sign-on failed. Use the protected email/password + MFA login.');
                    });
            } else if (ssoFailed) {
                stripBridgeHash('sso_failed');
                setError('Single sign-on failed. Use the protected email/password + MFA login.');
            }
        }

        const authStateWatchdog = window.setTimeout(() => {
            if (authHandshakeResolved || !mounted) return;
            invalidateActiveAttempt();
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError('Firebase Auth did not respond. Manual login remains available; verify authorized domains and network access.');
            setStatus('failed');
            markAuthReady();
        }, 12000);

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            window.clearTimeout(authStateWatchdog);
            if (!mounted) return;

            invalidateActiveAttempt();
            console.log('[ADMIN-AUTH] auth state callback received: ' + Boolean(firebaseUser));

            if (!firebaseUser) {
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();
                setError(null);
                setStatus('idle');
                markAuthReady();
                return;
            }

            const attempt: VerificationAttempt = {
                id: verificationGeneration,
                uid: firebaseUser.uid,
                timer: null,
                cancelled: false,
            };
            activeAttempt = attempt;

            attempt.timer = window.setTimeout(async () => {
                if (!isCurrentAttempt(attempt)) return;
                attempt.cancelled = true;
                attempt.timer = null;
                if (activeAttempt === attempt) activeAttempt = null;
                verificationGeneration += 1;

                const timedOutStatus = statusRef.current;
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();
                setError(timedOutStatus === 'verifying-token'
                    ? 'Token verification timed out. Please check your network connection and try again.'
                    : timedOutStatus === 'verifying-profile'
                        ? 'Admin profile lookup timed out. Please check your network connection and try again.'
                        : 'Admin verification timed out. Please try again.');
                setStatus('failed');
                console.log('[ADMIN-AUTH] final authorization status: failed (GLOBAL_TIMEOUT)');
                try {
                    await signOut(auth);
                } catch {
                    // Best effort only. A newer callback cannot be affected because this attempt is invalidated.
                }
            }, 30000);

            try {
                const verifiedUser = await verifyAdminUser(firebaseUser, attempt);
                if (!mutateIfCurrent(attempt, () => {
                    if (attempt.timer !== null) window.clearTimeout(attempt.timer);
                    attempt.timer = null;
                    setUser(verifiedUser);
                    setIsAuthenticated(true);
                    setMfaEnrollmentRequired(verifiedUser.mfaEnrollmentRequired === true);
                    setMfaVerified(verifiedUser.mfaVerified === true);
                    setMfaFactorCount(Number(verifiedUser.mfaFactorCount || 0));
                    setError(null);
                    setStatus('authorized');
                })) return;
                console.log('[ADMIN-AUTH] final authorization status: authorized');
            } catch (authError: any) {
                if (!isCurrentAttempt(attempt)) return;
                if (attempt.timer !== null) window.clearTimeout(attempt.timer);
                attempt.timer = null;

                console.error('[ADMIN-AUTH] Verification failed:', authError);
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();

                const errMessage = authError?.message || '';
                const errCode = authError?.code || '';
                let authMessage = '';
                if (errMessage === 'AUTH_TOKEN_TIMEOUT') authMessage = 'Token verification timed out. Please check your network connection and try again.';
                else if (errMessage === 'ADMIN_PROFILE_TIMEOUT') authMessage = 'Admin profile lookup timed out. Please check your network connection and try again.';
                else if (errMessage === 'ADMIN_PROFILE_LOOKUP_FAILED') authMessage = 'Admin profile lookup failed. Verify your user profile in the database.';
                else if (errMessage === 'ADMIN_MFA_REQUIRED') authMessage = 'Admin MFA verification is required. Sign in again and complete the second-factor challenge.';
                else if (errCode === 'auth/network-request-failed' || errMessage.toLowerCase().includes('network')) authMessage = 'Network connection failed. Please try again.';
                else if (errMessage === 'INVALID_ADMIN_CLAIMS') authMessage = 'Access denied: missing or invalid Admin claims.';
                else authMessage = `Admin verification failed: ${errMessage || errCode || 'unknown error'}`;

                setError(authMessage);
                setStatus('failed');
                attempt.cancelled = true;
                if (activeAttempt === attempt) activeAttempt = null;
                verificationGeneration += 1;
                console.log('[ADMIN-AUTH] final authorization status: failed (' + (errMessage || errCode) + ')');
                try {
                    await signOut(auth);
                } catch {
                    // Sign-out cleanup is best effort.
                }
            } finally {
                markAuthReady();
            }
        });

        return () => {
            mounted = false;
            invalidateActiveAttempt();
            window.clearTimeout(authStateWatchdog);
            unsubscribe();
        };
    }, []);

    const login = async ({ email, password }: { email: string; password: string }) => {
        setError(null);
        setStatus('verifying-token');
        try {
            await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
        } catch (err: any) {
            setStatus('failed');
            throw err;
        }
    };

    const logout = async () => {
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
        setMfaEnrollmentRequired(false);
        setMfaVerified(false);
        setMfaFactorCount(0);
        setError(null);
        setStatus('idle');
    };

    const contextValue = useMemo(() => ({
        isAuthenticated, loading, error, user, mfaEnrollmentRequired, mfaVerified,
        mfaFactorCount, login, logout, status,
    }), [isAuthenticated, loading, error, user, mfaEnrollmentRequired, mfaVerified, mfaFactorCount, status]);

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
