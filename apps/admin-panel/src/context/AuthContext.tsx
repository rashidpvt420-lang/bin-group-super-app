import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { getIdTokenResult, signInWithCustomToken, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { addDoc, auth, collection, db, doc, getDoc, onAuthStateChanged, serverTimestamp } from '../lib/firebase';

interface AuthContextType {
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
    user: any;
    login: (credentials: { email: string; password: string }) => Promise<void>;
    logout: () => Promise<void>;
}

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

const profileGrantsAdmin = (profile: Record<string, unknown> | null) => {
    const role = roleFrom(profile);
    return Boolean(
        profile?.admin === true ||
        profile?.isAdmin === true ||
        profile?.ceo === true ||
        profile?.manager === true ||
        ADMIN_ROLES.has(role)
    );
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any | null>(null);

    useEffect(() => {
        let mounted = true;
        let authHandshakeResolved = false;

        const markAuthReady = () => {
            if (!mounted || authHandshakeResolved) return;
            authHandshakeResolved = true;
            setLoading(false);
            const bootWindow = window as typeof window & { __BIN_GROUPS_BOOT__?: Record<string, unknown> };
            bootWindow.__BIN_GROUPS_BOOT__ = {
                ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
                authReady: true,
            };
        };

        const verifyAdminUser = async (firebaseUser: any) => {
            const idTokenResult = await timeout(getIdTokenResult(firebaseUser, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            const claims = (idTokenResult.claims || {}) as Record<string, unknown>;
            const claimRole = roleFrom(claims);
            const claimsAdmin = claimsGrantAdmin(claims);

            let profile: Record<string, unknown> | null = null;
            let profileReadError: unknown = null;
            try {
                const userDoc = await timeout(getDoc(doc(db, 'users', firebaseUser.uid)), 8000, 'ADMIN_PROFILE_TIMEOUT');
                profile = userDoc.exists() ? (userDoc.data() as Record<string, unknown>) : null;
            } catch (profileError) {
                profileReadError = profileError;
                console.warn('[ADMIN-AUTH] Profile lookup failed; claims remain authoritative:', profileError);
            }

            const profileRole = roleFrom(profile);
            const profileAdmin = profileGrantsAdmin(profile);
            const isAdmin = claimsAdmin || profileAdmin;
            const isStaff = STAFF_ROLES.has(claimRole) || STAFF_ROLES.has(profileRole);
            const role = claimRole || profileRole;

            if (!isAdmin && !isStaff) {
                if (profileReadError && !claimsAdmin) throw new Error('ADMIN_PROFILE_LOOKUP_FAILED');
                throw new Error('ADMIN_ACCESS_DENIED');
            }

            await addDoc(collection(db, 'audit_logs'), {
                actorId: firebaseUser.uid,
                actorRole: role,
                targetType: 'system',
                targetId: 'admin-panel',
                action: 'login',
                userAgent: navigator.userAgent,
                createdAt: serverTimestamp(),
            }).catch((auditError) => console.warn('[ADMIN-AUTH] Audit log write skipped:', auditError));

            return { ...firebaseUser, ...profile, role, isAdmin, claims };
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
                        if (mounted) setError('Single sign-on failed. Sign in with a production admin account.');
                    });
            } else if (ssoFailed) {
                stripBridgeHash('sso_failed');
                setError('Single sign-on failed. Sign in with a production admin account.');
            }
        }

        const authStateWatchdog = window.setTimeout(() => {
            if (authHandshakeResolved) return;
            setIsAuthenticated(false);
            setUser(null);
            setError('Firebase Auth did not respond. Manual login remains available; verify authorized domains and network access.');
            markAuthReady();
        }, 12000);

        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            window.clearTimeout(authStateWatchdog);
            if (!mounted) return;

            if (!firebaseUser) {
                setIsAuthenticated(false);
                setUser(null);
                setError(null);
                markAuthReady();
                return;
            }

            try {
                const verifiedUser = await verifyAdminUser(firebaseUser);
                if (!mounted) return;
                setUser(verifiedUser);
                setIsAuthenticated(true);
                setError(null);
            } catch (authError: any) {
                console.error('[ADMIN-AUTH] Verification failed:', authError);
                if (!mounted) return;
                setIsAuthenticated(false);
                setUser(null);
                setError(authError?.message === 'ADMIN_ACCESS_DENIED'
                    ? 'This account does not have an approved admin or staff role.'
                    : 'Admin verification failed. Confirm production claims and the user profile.');
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
            window.clearTimeout(authStateWatchdog);
            unsubscribe();
        };
    }, []);

    const login = async ({ email, password }: { email: string; password: string }) => {
        setError(null);
        await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
    };

    const logout = async () => {
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
    };

    const contextValue = useMemo(
        () => ({ isAuthenticated, loading, error, user, login, logout }),
        [isAuthenticated, loading, error, user],
    );

    return <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within an AuthProvider');
    return context;
};
