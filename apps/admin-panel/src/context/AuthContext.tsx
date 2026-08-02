import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
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
    retryAuthorization: () => Promise<void>;
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
    'admin',
    'super_admin',
    'ceo',
    'manager',
    'operations_admin',
    'finance_admin',
    'hr_admin',
    'support_admin',
]);

const STAFF_ROLES = new Set([
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager',
]);

const roleFrom = (source: Record<string, unknown> | null | undefined) => String(
    source?.role || source?.userRole || source?.primaryRole || '',
).trim().toLowerCase();

const claimsGrantAdmin = (claims: Record<string, unknown>) => {
    const role = roleFrom(claims);
    return Boolean(
        claims.admin === true ||
        claims.isAdmin === true ||
        claims.ceo === true ||
        claims.manager === true ||
        ADMIN_ROLES.has(role)
    );
};

const secondFactorFromClaims = (claims: Record<string, unknown>) => {
    const firebaseClaims = claims.firebase && typeof claims.firebase === 'object'
        ? claims.firebase as Record<string, unknown>
        : {};
    return String(
        firebaseClaims.sign_in_second_factor ||
        claims.sign_in_second_factor ||
        '',
    ).trim();
};

const timeout = <T,>(promise: Promise<T>, ms: number, code: string): Promise<T> => new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(code)), ms);
    promise.then(
        (value) => {
            window.clearTimeout(timer);
            resolve(value);
        },
        (error) => {
            window.clearTimeout(timer);
            reject(error);
        },
    );
});

const stripBridgeHash = (key: 'bridge_token' | 'sso_failed') => {
    if (typeof window === 'undefined') return;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    hashParams.delete(key);
    const remainingHash = hashParams.toString();
    const cleanUrl = `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
};

const shouldBlockForInitialAuth = () => {
    if (typeof window === 'undefined') return true;
    return window.location.pathname !== '/login';
};

const messageForAuthorizationError = (authError: any) => {
    const errMessage = String(authError?.message || '');
    const errCode = String(authError?.code || '');

    if (errMessage === 'AUTH_TOKEN_TIMEOUT') {
        return 'Token verification timed out. Please check your network connection and try again.';
    }
    if (errMessage === 'ADMIN_PROFILE_TIMEOUT') {
        return 'Admin profile lookup timed out. Please check your network connection and try again.';
    }
    if (errMessage === 'ADMIN_PROFILE_LOOKUP_FAILED') {
        return 'Admin profile lookup failed. Verify your user profile in the database.';
    }
    if (errMessage === 'ADMIN_MFA_REQUIRED') {
        return 'The completed MFA session did not contain a verified second-factor claim. Retry authorization or reset the secure session.';
    }
    if (errCode === 'auth/network-request-failed' || errMessage.toLowerCase().includes('network')) {
        return 'Network connection failed. Please try again.';
    }
    if (errMessage === 'INVALID_ADMIN_CLAIMS') {
        return 'Access denied: missing or invalid Admin claims.';
    }
    return `Admin verification failed: ${errMessage || errCode || 'unknown error'}`;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [status, setStatusState] = useState<AuthStatus>(
        shouldBlockForInitialAuth() ? 'restoring-session' : 'idle'
    );
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
    const [mfaVerified, setMfaVerified] = useState(false);
    const [mfaFactorCount, setMfaFactorCount] = useState(0);

    const mountedRef = useRef(true);
    const statusRef = useRef<AuthStatus>(status);
    const verificationGenerationRef = useRef(0);
    const activeAttemptRef = useRef<VerificationAttempt | null>(null);
    const authReadyRef = useRef(false);

    const setStatus = useCallback((nextStatus: AuthStatus) => {
        statusRef.current = nextStatus;
        setStatusState(nextStatus);
    }, []);

    const markAuthReady = useCallback(() => {
        if (!mountedRef.current || authReadyRef.current) return;
        authReadyRef.current = true;
        const bootWindow = window as typeof window & { __BIN_GROUPS_BOOT__?: Record<string, unknown> };
        bootWindow.__BIN_GROUPS_BOOT__ = {
            ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
            authReady: true,
        };
    }, []);

    const resetMfaState = useCallback(() => {
        setMfaEnrollmentRequired(false);
        setMfaVerified(false);
        setMfaFactorCount(0);
    }, []);

    const invalidateActiveAttempt = useCallback(() => {
        verificationGenerationRef.current += 1;
        const activeAttempt = activeAttemptRef.current;
        if (activeAttempt) {
            activeAttempt.cancelled = true;
            if (activeAttempt.timer !== null) window.clearTimeout(activeAttempt.timer);
            activeAttempt.timer = null;
        }
        activeAttemptRef.current = null;
    }, []);

    const isCurrentAttempt = useCallback((attempt: VerificationAttempt) => Boolean(
        mountedRef.current &&
        !attempt.cancelled &&
        activeAttemptRef.current === attempt &&
        verificationGenerationRef.current === attempt.id &&
        auth.currentUser?.uid === attempt.uid
    ), []);

    const authorizeFirebaseUser = useCallback(async (firebaseUser: any) => {
        invalidateActiveAttempt();

        const attempt: VerificationAttempt = {
            id: verificationGenerationRef.current,
            uid: firebaseUser.uid,
            timer: null,
            cancelled: false,
        };
        activeAttemptRef.current = attempt;

        const failCurrentAttempt = (message: string) => {
            if (!isCurrentAttempt(attempt)) return false;
            attempt.cancelled = true;
            if (attempt.timer !== null) window.clearTimeout(attempt.timer);
            attempt.timer = null;
            activeAttemptRef.current = null;
            verificationGenerationRef.current += 1;
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError(message);
            setStatus('failed');
            return true;
        };

        attempt.timer = window.setTimeout(() => {
            const timedOutStatus = statusRef.current;
            const timeoutMessage = timedOutStatus === 'verifying-token'
                ? 'Token verification timed out. Please check your network connection and try again.'
                : timedOutStatus === 'verifying-profile'
                    ? 'Admin profile lookup timed out. Please check your network connection and try again.'
                    : 'Admin verification timed out. Please try again.';
            failCurrentAttempt(timeoutMessage);
        }, 30000);

        try {
            if (!isCurrentAttempt(attempt)) return;
            setError(null);
            setStatus('verifying-token');

            const idTokenResult = await timeout(getIdTokenResult(firebaseUser, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            if (!isCurrentAttempt(attempt)) return;

            const claims = (idTokenResult.claims || {}) as Record<string, unknown>;
            const claimRole = roleFrom(claims);
            const claimsAdmin = claimsGrantAdmin(claims);

            setStatus('verifying-profile');
            let profile: Record<string, unknown> | null = null;
            let profileReadError: unknown = null;

            try {
                const userDoc = await timeout(getDoc(doc(db, 'users', firebaseUser.uid)), 8000, 'ADMIN_PROFILE_TIMEOUT');
                if (!isCurrentAttempt(attempt)) return;
                profile = userDoc.exists() ? (userDoc.data() as Record<string, unknown>) : null;
            } catch (profileError: any) {
                if (!isCurrentAttempt(attempt)) return;
                profileReadError = profileError;
                if (profileError?.message === 'ADMIN_PROFILE_TIMEOUT') throw profileError;
                console.warn('[ADMIN-AUTH] Profile lookup failed; claims remain authoritative:', profileError);
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

            if (factorCount > 0 && !verifiedSecondFactor) {
                throw new Error('ADMIN_MFA_REQUIRED');
            }
            if (!isCurrentAttempt(attempt)) return;

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

            if (!isCurrentAttempt(attempt)) return;
            if (attempt.timer !== null) window.clearTimeout(attempt.timer);
            attempt.timer = null;
            activeAttemptRef.current = null;

            setUser({
                ...firebaseUser,
                ...profile,
                role: claimRole,
                isAdmin,
                claims,
                mfaEnrollmentRequired: enrollmentRequired,
                mfaVerified: verifiedSecondFactor,
                mfaFactorCount: factorCount,
            });
            setIsAuthenticated(true);
            setMfaEnrollmentRequired(enrollmentRequired);
            setMfaVerified(verifiedSecondFactor);
            setMfaFactorCount(factorCount);
            setError(null);
            setStatus('authorized');
            markAuthReady();
        } catch (authError: any) {
            failCurrentAttempt(messageForAuthorizationError(authError));
            markAuthReady();
        }
    }, [invalidateActiveAttempt, isCurrentAttempt, markAuthReady, resetMfaState, setStatus]);

    const retryAuthorization = useCallback(async () => {
        const currentUser = auth.currentUser;
        if (!currentUser) {
            invalidateActiveAttempt();
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError('No secure Firebase session is available. Reset the secure session and sign in again.');
            setStatus('failed');
            return;
        }

        setError(null);
        setIsAuthenticated(false);
        setStatus('verifying-token');

        try {
            await timeout(getIdTokenResult(currentUser, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            if (auth.currentUser?.uid !== currentUser.uid) {
                throw new Error('AUTH_SESSION_CHANGED');
            }
            await authorizeFirebaseUser(currentUser);
        } catch (retryError: any) {
            invalidateActiveAttempt();
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError(messageForAuthorizationError(retryError));
            setStatus('failed');
        }
    }, [authorizeFirebaseUser, invalidateActiveAttempt, resetMfaState, setStatus]);

    useEffect(() => {
        mountedRef.current = true;

        if (typeof window !== 'undefined') {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const bridgeToken = hashParams.get('bridge_token');
            const ssoFailed = hashParams.get('sso_failed');

            if (bridgeToken) {
                stripBridgeHash('bridge_token');
                void timeout(signInWithCustomToken(auth, bridgeToken), 10000, 'BRIDGE_TOKEN_TIMEOUT')
                    .catch((bridgeError) => {
                        console.warn('[ADMIN-AUTH] Bridge token exchange failed:', bridgeError);
                        if (mountedRef.current) {
                            setError('Single sign-on failed. Use the protected email/password + MFA login.');
                        }
                    });
            } else if (ssoFailed) {
                stripBridgeHash('sso_failed');
                setError('Single sign-on failed. Use the protected email/password + MFA login.');
            }
        }

        const authStateWatchdog = window.setTimeout(() => {
            if (authReadyRef.current || !mountedRef.current) return;
            invalidateActiveAttempt();
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError('Firebase Auth did not respond. Manual login remains available; verify authorized domains and network access.');
            setStatus('failed');
            markAuthReady();
        }, 12000);

        const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
            window.clearTimeout(authStateWatchdog);
            if (!mountedRef.current) return;

            if (!firebaseUser) {
                invalidateActiveAttempt();
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();
                if (statusRef.current !== 'failed') {
                    setError(null);
                    setStatus('idle');
                }
                markAuthReady();
                return;
            }

            if (isAuthenticated && user?.uid === firebaseUser.uid && statusRef.current === 'authorized') {
                markAuthReady();
                return;
            }

            void authorizeFirebaseUser(firebaseUser);
        });

        return () => {
            mountedRef.current = false;
            window.clearTimeout(authStateWatchdog);
            invalidateActiveAttempt();
            unsubscribe();
        };
    }, [authorizeFirebaseUser, invalidateActiveAttempt, isAuthenticated, markAuthReady, resetMfaState, setStatus, user?.uid]);

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
        invalidateActiveAttempt();
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
        resetMfaState();
        setError(null);
        setStatus('idle');
    };

    const loading = status === 'restoring-session' || status === 'verifying-token' || status === 'verifying-profile';

    const contextValue = useMemo(
        () => ({
            isAuthenticated,
            loading,
            error,
            user,
            mfaEnrollmentRequired,
            mfaVerified,
            mfaFactorCount,
            login,
            logout,
            retryAuthorization,
            status,
        }),
        [isAuthenticated, loading, error, user, mfaEnrollmentRequired, mfaVerified, mfaFactorCount, retryAuthorization, status],
    );

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
