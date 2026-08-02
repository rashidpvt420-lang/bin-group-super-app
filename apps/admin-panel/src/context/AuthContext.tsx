import React, { createContext, useContext, useEffect, useMemo, useState, useRef, useCallback } from 'react';
import { getIdTokenResult, multiFactor, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, auth, collection, db, doc, getDoc, onAuthStateChanged, serverTimestamp, verifyAdminAppCheckToken } from '../lib/firebase';

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

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const ADMIN_ROLES = new Set([
    'admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin',
]);

const STAFF_ROLES = new Set([
    'hr_manager', 'hr_staff', 'finance_staff', 'account_manager', 'dispatcher', 'operations_manager',
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

const shouldBlockForInitialAuth = () => {
    if (typeof window === 'undefined') return true;
    return window.location.pathname !== '/login';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [status, setStatusState] = useState<AuthContextType['status']>(
        shouldBlockForInitialAuth() ? 'restoring-session' : 'idle'
    );
    const statusRef = useRef(status);
    const setStatus = useCallback((newStatus: AuthContextType['status']) => {
        statusRef.current = newStatus;
        setStatusState(newStatus);
    }, []);

    const loading = status === 'restoring-session' || status === 'verifying-token' || status === 'verifying-profile';
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const [mfaEnrollmentRequired, setMfaEnrollmentRequired] = useState(false);
    const [mfaVerified, setMfaVerified] = useState(false);
    const [mfaFactorCount, setMfaFactorCount] = useState(0);
    
    // Attempt isolation refs
    const mountedRef = useRef(true);
    const generationRef = useRef(0);
    const currentUidRef = useRef('');
    const globalTimeoutRef = useRef<number | null>(null);
    const manualRetryTriggerRef = useRef<((firebaseUser: any) => Promise<void>) | null>(null);

    useEffect(() => {
        mountedRef.current = true;
        let authHandshakeResolved = false;

        const markAuthReady = () => {
            if (!mountedRef.current || authHandshakeResolved) return;
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

        const verifyAdminUser = async (firebaseUser: any, attemptId: number, expectedUid: string) => {
            console.log('[ADMIN-AUTH] token verification started for generation', attemptId);
            setStatus('verifying-token');
            
            let idTokenResult = await timeout(getIdTokenResult(firebaseUser, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;

            let claims = (idTokenResult.claims || {}) as Record<string, unknown>;
            const factors = multiFactor(firebaseUser).enrolledFactors;
            const factorCount = factors.length;
            
            if (factorCount > 0 && !secondFactorFromClaims(claims)) {
                console.log('[ADMIN-AUTH] Enrolled factors exist but claim missing. Polling for up to 5 seconds...');
                for (let i = 0; i < 10; i++) {
                    await new Promise(r => setTimeout(r, 500));
                    if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                    idTokenResult = await timeout(getIdTokenResult(firebaseUser, true), 10000, 'AUTH_TOKEN_TIMEOUT');
                    if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                    claims = (idTokenResult.claims || {}) as Record<string, unknown>;
                    if (secondFactorFromClaims(claims)) break;
                }
            }

            console.log('[ADMIN-AUTH] token verification completed');

            const claimRole = roleFrom(claims);
            const claimsAdmin = claimsGrantAdmin(claims);

            console.log('[ADMIN-AUTH] App Check verification started');
            const appCheckResult = await verifyAdminAppCheckToken();
            if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
            
            if (!appCheckResult.success) {
                console.warn('[ADMIN-AUTH] App Check verification failed:', appCheckResult.error);
                throw new Error(appCheckResult.error);
            }
            console.log('[ADMIN-AUTH] App Check verification completed');

            let profile: Record<string, unknown> | null = null;
            let profileReadError: unknown = null;

            console.log('[ADMIN-AUTH] profile verification started');
            setStatus('verifying-profile');
            try {
                const userDoc = await timeout(getDoc(doc(db, 'users', firebaseUser.uid)), 8000, 'ADMIN_PROFILE_TIMEOUT');
                if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                profile = userDoc.exists() ? (userDoc.data() as Record<string, unknown>) : null;
                console.log('[ADMIN-AUTH] profile verification completed');
            } catch (profileError: any) {
                profileReadError = profileError;
                console.warn('[ADMIN-AUTH] Profile lookup failed; claims remain authoritative:', profileError);
                if (profileError?.message === 'ADMIN_PROFILE_TIMEOUT') {
                    throw profileError;
                }
            }

            if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;

            const isAdmin = claimsAdmin;
            const isStaff = STAFF_ROLES.has(claimRole);
            const role = claimRole;

            if (!isAdmin && !isStaff) {
                if (profileReadError && !claimRole) throw new Error('ADMIN_PROFILE_LOOKUP_FAILED');
                throw new Error('INVALID_ADMIN_CLAIMS');
            }

            const secondFactor = secondFactorFromClaims(claims);
            const enrollmentRequired = factorCount === 0;
            const verifiedSecondFactor = factorCount > 0 && Boolean(secondFactor);
            
            console.log('[ADMIN-AUTH] MFA resolver required: ' + Boolean(factorCount > 0 && !verifiedSecondFactor));

            if (factorCount > 0 && !verifiedSecondFactor) {
                throw new Error('ADMIN_MFA_REQUIRED');
            }

            await addDoc(collection(db, 'audit_logs'), {
                actorId: firebaseUser.uid,
                actorRole: role,
                targetType: 'system',
                targetId: 'admin-panel',
                action: enrollmentRequired ? 'ADMIN_LOGIN_MFA_ENROLLMENT_REQUIRED' : 'ADMIN_LOGIN_MFA_VERIFIED',
                mfaFactorCount: factorCount,
                mfaSecondFactorPresent: verifiedSecondFactor,
                userAgent: navigator.userAgent,
                createdAt: serverTimestamp(),
            }).catch((auditError) => console.warn('[ADMIN-AUTH] Audit log write skipped:', auditError));
            
            if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;

            return {
                ...firebaseUser,
                ...profile,
                role,
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
                        if (mountedRef.current) setError('Single sign-on failed. Use the protected email/password + MFA login.');
                    });
            } else if (ssoFailed) {
                stripBridgeHash('sso_failed');
                setError('Single sign-on failed. Use the protected email/password + MFA login.');
            }
        }

        const authStateWatchdog = window.setTimeout(() => {
            if (authHandshakeResolved) return;
            setIsAuthenticated(false);
            setUser(null);
            resetMfaState();
            setError('Firebase Auth did not respond. Manual login remains available; verify authorized domains and network access.');
            setStatus('failed');
            markAuthReady();
        }, 12000);
        
        const triggerVerification = async (firebaseUser: any) => {
            currentUidRef.current = firebaseUser.uid;
            generationRef.current++;
            const attemptId = generationRef.current;
            const expectedUid = firebaseUser.uid;

            if (globalTimeoutRef.current) {
                window.clearTimeout(globalTimeoutRef.current);
                globalTimeoutRef.current = null;
            }

            globalTimeoutRef.current = window.setTimeout(async () => {
                if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                console.error('[ADMIN-AUTH] Global verification timeout exceeded.');
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();
                
                let timeoutMessage = 'Admin verification timed out. Please try again.';
                if (statusRef.current === 'verifying-token') {
                    timeoutMessage = 'Token verification timed out. Please check your network connection and try again.';
                } else if (statusRef.current === 'verifying-profile') {
                    timeoutMessage = 'Admin profile lookup timed out. Please check your network connection and try again.';
                }
                setError(timeoutMessage);
                setStatus('failed');
                console.log('[ADMIN-AUTH] final authorization status: failed (GLOBAL_TIMEOUT)');
                // Transient error: do not sign out.
            }, 30000);

            try {
                const verifiedUser = await verifyAdminUser(firebaseUser, attemptId, expectedUid);
                if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                
                if (globalTimeoutRef.current) {
                    window.clearTimeout(globalTimeoutRef.current);
                    globalTimeoutRef.current = null;
                }
                
                setUser(verifiedUser);
                setIsAuthenticated(true);
                setMfaEnrollmentRequired(verifiedUser.mfaEnrollmentRequired === true);
                setMfaVerified(verifiedUser.mfaVerified === true);
                setMfaFactorCount(Number(verifiedUser.mfaFactorCount || 0));
                setError(null);
                setStatus('authorized');
                console.log('[ADMIN-AUTH] final authorization status: authorized');
            } catch (authError: any) {
                if (!mountedRef.current || generationRef.current !== attemptId || currentUidRef.current !== expectedUid) return;
                
                if (globalTimeoutRef.current) {
                    window.clearTimeout(globalTimeoutRef.current);
                    globalTimeoutRef.current = null;
                }
                console.error('[ADMIN-AUTH] Verification failed:', authError);
                
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();

                let authMessage = '';
                const errMessage = authError?.message || '';
                const errCode = authError?.code || '';
                
                let isTransient = false;

                if (errMessage === 'AUTH_TOKEN_TIMEOUT') {
                    authMessage = 'Token verification timed out. Please check your network connection and try again.';
                    isTransient = true;
                } else if (errMessage === 'ADMIN_PROFILE_TIMEOUT') {
                    authMessage = 'Admin profile lookup timed out. Please check your network connection and try again.';
                    isTransient = true;
                } else if (errMessage === 'ADMIN_PROFILE_LOOKUP_FAILED') {
                    authMessage = 'Admin profile lookup failed. Verify your user profile in the database.';
                    isTransient = true;
                } else if (errMessage === 'ADMIN_ACCESS_DENIED') {
                    authMessage = 'This account does not have an approved admin or staff role.';
                } else if (errMessage === 'ADMIN_MFA_REQUIRED') {
                    authMessage = 'Admin MFA verification is required. Sign in again and complete the second-factor challenge.';
                } else if (errCode === 'auth/network-request-failed' || errMessage.toLowerCase().includes('network')) {
                    authMessage = 'Network connection failed. Please try again.';
                    isTransient = true;
                } else if (errMessage === 'INVALID_ADMIN_CLAIMS') {
                    authMessage = 'Access denied: missing or invalid Admin claims.';
                } else if (errMessage === 'ADMIN_APPCHECK_RECAPTCHA_FAILED' || errMessage === 'ADMIN_APPCHECK_TOKEN_FAILED' || errMessage === 'ADMIN_APPCHECK_NOT_INITIALIZED') {
                    authMessage = 'Admin security verification could not obtain an App Check token for this domain. Access remains locked. Retry after confirming the App Check domain registration.';
                    isTransient = true;
                } else {
                    authMessage = `Admin verification failed: ${errMessage || errCode || 'unknown error'}`;
                    if (authMessage.includes('timeout') || authMessage.includes('unavailable') || authMessage.includes('deadline')) {
                        isTransient = true;
                    }
                }

                setError(authMessage);
                setStatus('failed');
                console.log('[ADMIN-AUTH] final authorization status: failed (' + (errMessage || errCode) + ')');
                
                if (!isTransient) {
                    try {
                        await signOut(auth);
                    } catch {
                        // Sign-out cleanup is best effort.
                    }
                } else {
                    console.log('[ADMIN-AUTH] Transient error captured. Firebase authenticated session retained for bounded retry.');
                }
            } finally {
                if (mountedRef.current && generationRef.current === attemptId && currentUidRef.current === expectedUid) {
                    markAuthReady();
                }
            }
        };

        manualRetryTriggerRef.current = triggerVerification;

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            window.clearTimeout(authStateWatchdog);
            if (!mountedRef.current) return;

            console.log('[ADMIN-AUTH] auth state callback received: ' + Boolean(firebaseUser));

            if (!firebaseUser) {
                currentUidRef.current = '';
                generationRef.current++;
                if (globalTimeoutRef.current) {
                    window.clearTimeout(globalTimeoutRef.current);
                    globalTimeoutRef.current = null;
                }
                setIsAuthenticated(false);
                setUser(null);
                resetMfaState();
                setError(null);
                setStatus('idle');
                markAuthReady();
                return;
            }

            if (firebaseUser.uid === currentUidRef.current && statusRef.current === 'authorized') {
                markAuthReady();
                return;
            }

            await triggerVerification(firebaseUser);
        });

        return () => {
            mountedRef.current = false;
            generationRef.current++;
            window.clearTimeout(authStateWatchdog);
            if (globalTimeoutRef.current) {
                window.clearTimeout(globalTimeoutRef.current);
            }
            unsubscribe();
        };
    }, [setStatus]);

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
        generationRef.current++;
        if (globalTimeoutRef.current) {
            window.clearTimeout(globalTimeoutRef.current);
            globalTimeoutRef.current = null;
        }
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
        setMfaEnrollmentRequired(false);
        setMfaVerified(false);
        setMfaFactorCount(0);
        setError(null);
        setStatus('idle');
    };
    
    const retryAuthorization = useCallback(async () => {
        if (auth.currentUser && manualRetryTriggerRef.current) {
            setError(null);
            await manualRetryTriggerRef.current(auth.currentUser);
        }
    }, []);

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
        [isAuthenticated, loading, error, user, mfaEnrollmentRequired, mfaVerified, mfaFactorCount, status, retryAuthorization],
    );

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
