import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { signOut, getIdTokenResult, signInWithCustomToken, signInWithEmailAndPassword } from 'firebase/auth';
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { auth, db, onAuthStateChanged } from '../lib/firebase';

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

// Staff-tier roles provisioned via adminCreateUser that need read access to this
// panel (e.g. HRManagementPage) but must never be granted isAdmin.
const STAFF_ROLES = new Set([
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager',
]);

const canonicalEmail = (value: unknown) => {
    const email = String(value || '').trim().toLowerCase();
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
    const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
    return `${normalizedLocal}@${normalizedDomain}`;
};

const envFounderEmails = (process.env.REACT_APP_FOUNDER_ADMIN_EMAILS || '')
    .split(',')
    .map((email) => canonicalEmail(email))
    .filter(Boolean);

const BOOTSTRAP_ADMIN_EMAILS = new Set([
    'ceo@bin-groups.com',
    'ceo@bin-group.com',
    ...envFounderEmails,
]);

const claimRoleFrom = (claims: Record<string, unknown>) => String(claims.role || claims.userRole || claims.primaryRole || '').trim().toLowerCase();
const profileRoleFrom = (profile: any) => String(profile?.role || profile?.userRole || profile?.primaryRole || '').trim().toLowerCase();
const founderEmailGrantsAdmin = (email: unknown) => BOOTSTRAP_ADMIN_EMAILS.has(canonicalEmail(email));

const claimsGrantAdmin = (claims: Record<string, unknown>) => {
    const role = claimRoleFrom(claims);
    return Boolean(
        claims.admin === true ||
        claims.isAdmin === true ||
        claims.ceo === true ||
        claims.manager === true ||
        ADMIN_ROLES.has(role)
    );
};

const profileGrantsAdmin = (profile: any) => {
    const role = profileRoleFrom(profile);
    return Boolean(
        profile?.admin === true ||
        profile?.isAdmin === true ||
        profile?.ceo === true ||
        profile?.manager === true ||
        ADMIN_ROLES.has(role)
    );
};

const timeout = <T,>(promise: Promise<T>, ms: number, code: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(code)), ms)),
    ]);
};

const stripBridgeHash = (key: 'bridge_token' | 'sso_failed') => {
    if (typeof window === 'undefined') return;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    hashParams.delete(key);
    const remainingHash = hashParams.toString();
    const cleanUrl = `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
    window.history.replaceState({}, document.title, cleanUrl);
};

export const AuthProvider: React.FC<{ children: any }> = ({ children }) => {
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
            const bootWindow = window as any;
            bootWindow.__BIN_GROUPS_BOOT__ = {
                ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
                authReady: true,
            };
            console.log('🔍 [DIAG] Admin Auth handshake marked as READY.');
        };

        const verifyAdminUser = async (usr: any) => {
            const idTokenResult = await timeout(getIdTokenResult(usr, true), 15000, 'AUTH_TOKEN_TIMEOUT');
            const claims = idTokenResult.claims || {};
            const claimRole = claimRoleFrom(claims);
            const claimsAdmin = claimsGrantAdmin(claims);
            const isFounderBootstrap = founderEmailGrantsAdmin(usr.email);

            let profile: any = null;
            let profileReadError: unknown = null;

            try {
                const userDoc = await timeout(getDoc(doc(db, 'users', usr.uid)), 8000, 'ADMIN_PROFILE_TIMEOUT');
                profile = userDoc.exists() ? userDoc.data() : null;
            } catch (profileErr) {
                profileReadError = profileErr;
                console.warn('[ADMIN-AUTH] Profile lookup failed; continuing with claims/founder bootstrap check:', profileErr);
            }

            const profileRole = profileRoleFrom(profile);
            const profileAdmin = profileGrantsAdmin(profile);
            const isAdmin = claimsAdmin || profileAdmin || isFounderBootstrap;
            const isStaff = STAFF_ROLES.has(claimRole) || STAFF_ROLES.has(profileRole);
            const role = isFounderBootstrap ? 'super_admin' : (claimRole || profileRole || '');

            if (!isAdmin && !isStaff) {
                if (profileReadError && !claimsAdmin && !isFounderBootstrap) {
                    throw new Error('ADMIN_PROFILE_LOOKUP_FAILED');
                }
                throw new Error('ADMIN_ACCESS_DENIED');
            }

            if (isFounderBootstrap && (!profile || profile.role !== 'super_admin' || profile.isAdmin !== true || profile.admin !== true)) {
                // Founder self-healing profile repair. Failure is non-fatal because
                // the founder email itself is the bootstrap fallback.
                setDoc(doc(db, 'users', usr.uid), {
                    uid: usr.uid,
                    email: canonicalEmail(usr.email),
                    displayName: usr.displayName || profile?.displayName || 'BIN GROUP CEO',
                    role: 'super_admin',
                    userRole: 'super_admin',
                    primaryRole: 'super_admin',
                    isAdmin: true,
                    admin: true,
                    ceo: true,
                    adminApproved: true,
                    onboardingComplete: true,
                    status: 'ACTIVE',
                    founderBootstrapRepairedAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                }, { merge: true }).catch((repairErr) => console.warn('[ADMIN-AUTH] Founder profile repair deferred:', repairErr));
            }

            addDoc(collection(db, 'audit_logs'), {
                actorId: usr.uid,
                actorRole: role,
                targetType: 'system',
                targetId: 'admin-panel',
                action: 'login',
                userAgent: navigator.userAgent,
                bootstrapAdmin: isFounderBootstrap,
                createdAt: serverTimestamp(),
            }).catch((auditErr) => console.warn('[ADMIN-AUTH] Audit log write skipped:', auditErr));

            return { ...usr, ...profile, role, isAdmin, claims, bootstrapAdmin: isFounderBootstrap };
        };

        console.log('🔍 [DIAG] Standalone Admin AuthProvider mounted.');

        if (typeof window !== 'undefined') {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const bridgeToken = hashParams.get('bridge_token');
            const ssoFailed = hashParams.get('sso_failed');

            if (bridgeToken) {
                stripBridgeHash('bridge_token');
                timeout(signInWithCustomToken(auth, bridgeToken), 10000, 'BRIDGE_TOKEN_TIMEOUT')
                    .catch((err) => {
                        console.warn('[ADMIN-AUTH] Bridge token exchange failed; manual login remains available.', err);
                        if (mounted) setError('Single sign-on from the main app failed. Please sign in with your admin credentials below.');
                    });
            } else if (ssoFailed) {
                stripBridgeHash('sso_failed');
                setError('Single sign-on from the main app failed. Please sign in with your admin credentials below.');
            }
        }

        const authStateWatchdog = window.setTimeout(() => {
            if (authHandshakeResolved) return;
            console.error('🛡️ [AUTH] onAuthStateChanged did not fire within watchdog window. Showing manual login instead of blocking the panel.');
            setIsAuthenticated(false);
            setUser(null);
            setError('Firebase Auth is slow or blocked on this device. Manual admin login is still available below. Confirm bin-group-admin-panel.web.app and bin-group-admin-panel.firebaseapp.com are authorized domains if this repeats.');
            markAuthReady();
        }, 12000);

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            window.clearTimeout(authStateWatchdog);
            console.log('🛡️ [AUTH] State Changed:', usr ? usr.email : 'LOGGED_OUT');

            if (!usr) {
                setIsAuthenticated(false);
                setUser(null);
                markAuthReady();
                return;
            }

            try {
                const verifiedUser = await verifyAdminUser(usr);
                if (!mounted) return;
                setUser(verifiedUser);
                setIsAuthenticated(true);
                setError(null);
            } catch (err: any) {
                console.error('🛡️ [AUTH] Admin Auth Error:', err);
                if (!mounted) return;
                setIsAuthenticated(false);
                setUser(null);

                if (err.message === 'AUTH_TOKEN_TIMEOUT') {
                    setError('Admin token check timed out. Use Reset & Login, then retry. If this persists, confirm bin-group-admin-panel.web.app and bin-group-admin-panel.firebaseapp.com are both listed under Firebase Authentication > Settings > Authorized domains.');
                } else if (err.message === 'ADMIN_PROFILE_TIMEOUT' || err.message === 'ADMIN_PROFILE_LOOKUP_FAILED') {
                    setError('Admin profile could not be verified from Firestore. Use the founder admin email or repair the /users profile/admin claims.');
                    await signOut(auth).catch(() => undefined);
                } else if (err.message === 'ADMIN_ACCESS_DENIED') {
                    setError('This account does not have admin access. Use ceo@bin-groups.com or assign admin custom claims/profile role.');
                    await signOut(auth).catch(() => undefined);
                } else {
                    setError('Admin login failed. Use Reset & Login, then try again.');
                }
            } finally {
                markAuthReady();
            }
        }, (authErr) => {
            window.clearTimeout(authStateWatchdog);
            console.error('[ADMIN-AUTH] Auth observer failed:', authErr);
            setIsAuthenticated(false);
            setUser(null);
            setError('Firebase Auth observer failed. Check authorized domains and Firebase web app configuration.');
            markAuthReady();
        });

        return () => {
            mounted = false;
            window.clearTimeout(authStateWatchdog);
            unsubscribe();
        };
    }, []);

    const login = async (credentials: { email: string; password: string }) => {
        await signInWithEmailAndPassword(auth, credentials.email.trim().toLowerCase(), credentials.password);
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } finally {
            setIsAuthenticated(false);
            setUser(null);
            window.location.href = '/login';
        }
    };

    const value = useMemo(() => ({ isAuthenticated, loading, error, user, login, logout }), [isAuthenticated, loading, error, user]);

    return (
        <AuthContext.Provider value={value}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
