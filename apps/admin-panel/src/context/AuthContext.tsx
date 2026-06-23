import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, onAuthStateChanged, app } from '../lib/firebase';
import { signOut, getIdTokenResult, signInWithCustomToken } from 'firebase/auth';
import { getDoc, doc, updateDoc, setDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { isSupported, getMessaging, getToken } from 'firebase/messaging';

interface AuthContextType {
    isAuthenticated: boolean;
    loading: boolean;
    error: string | null;
    user: any;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
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

const DEFAULT_FOUNDER_ADMIN_EMAILS = [
    'ceo@bin-groups.com',
    'ceo@bin-group.com',
];

const canonicalEmail = (value: unknown) => {
    const email = String(value || '').trim().toLowerCase();
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
    const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
    return `${normalizedLocal}@${normalizedDomain}`;
};

const BOOTSTRAP_ADMIN_EMAILS = new Set([
    ...DEFAULT_FOUNDER_ADMIN_EMAILS,
    ...(process.env.REACT_APP_FOUNDER_ADMIN_EMAILS || '')
        .split(',')
        .map((email) => canonicalEmail(email))
        .filter(Boolean),
]);

const claimRoleFrom = (claims: Record<string, unknown>) => String(claims.role || claims.userRole || claims.primaryRole || '').trim().toLowerCase();
const profileRoleFrom = (profile: any) => String(profile?.role || profile?.userRole || profile?.primaryRole || '').trim().toLowerCase();

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

const founderEmailGrantsAdmin = (email: unknown) => BOOTSTRAP_ADMIN_EMAILS.has(canonicalEmail(email));

const timeout = <T,>(promise: Promise<T>, ms: number, code: string): Promise<T> => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(code)), ms)),
    ]);
};

export const AuthProvider: React.FC<{ children: any }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [user, setUser] = useState<any | null>(null);
    const loadingRef = useRef(loading);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        console.log("🔍 [DIAG] Admin AuthProvider Mounted. Monitoring state...");

        // Redeem a one-time bridge token minted by the main app so staff/admins
        // coming from the cross-domain redirect don't have to sign in a second
        // time. Stripped from the URL immediately regardless of outcome so it
        // never lingers in history. The resulting sign-in (or its absence) is
        // picked up by onAuthStateChanged below; see the `usr === null` branch,
        // which waits on this before treating the session as logged out so the
        // login page doesn't flash while the exchange is still in flight.
        let bridgeExchange: Promise<unknown> | null = null;
        if (typeof window !== 'undefined') {
            // Read from the URL fragment, not the query string: fragments are
            // never transmitted to the server (no access-log or Referer-header
            // exposure of the bearer token), unlike a ?bridge_token= query param.
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const bridgeToken = hashParams.get('bridge_token');
            const ssoFailed = hashParams.get('sso_failed');
            if (bridgeToken) {
                hashParams.delete('bridge_token');
                const remainingHash = hashParams.toString();
                const cleanUrl = `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
                window.history.replaceState({}, document.title, cleanUrl);
                bridgeExchange = timeout(signInWithCustomToken(auth, bridgeToken), 10000, 'BRIDGE_TOKEN_TIMEOUT').catch((err) => {
                    console.warn('[ADMIN-AUTH] Bridge token exchange failed; falling back to manual login.', err);
                });
            } else if (ssoFailed) {
                // The main app couldn't mint/redeem a bridge token (cold start,
                // network blip, etc.) and sent the user here to log in manually.
                // Surface that explicitly instead of leaving them on what looks
                // like an unprompted, ordinary login form.
                hashParams.delete('sso_failed');
                const remainingHash = hashParams.toString();
                const cleanUrl = `${window.location.pathname}${window.location.search}${remainingHash ? `#${remainingHash}` : ''}`;
                window.history.replaceState({}, document.title, cleanUrl);
                setError('Single sign-on from the main app failed. Please sign in with your admin credentials below.');
            }
        }

        let authHandshakeResolved = false;
        const markAuthReady = () => {
            if (authHandshakeResolved) return;
            authHandshakeResolved = true;
            setLoading(false);
            if (typeof window !== 'undefined') {
                const bootWindow = window as any;
                bootWindow.__BIN_GROUPS_BOOT__ = {
                    ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
                    authReady: true,
                };
            }
            console.log("🔍 [DIAG] Admin Auth handshake marked as READY.");
        };

        const authStateWatchdog = window.setTimeout(() => {
            if (authHandshakeResolved) return;
            console.error('🛡️ [AUTH] onAuthStateChanged did not fire within watchdog window.');
            setError('Admin token check timed out. Use Reset & Login, then retry. If this persists, confirm bin-group-admin-panel.web.app and bin-group-admin-panel.firebaseapp.com are both listed under Firebase Authentication > Settings > Authorized domains.');
            markAuthReady();
        }, 12000);

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            window.clearTimeout(authStateWatchdog);
            console.log("🛡️ [AUTH] State Changed:", usr ? usr.email : "LOGGED_OUT");
            
            if (!usr) {
                if (bridgeExchange) {
                    const pending = bridgeExchange;
                    bridgeExchange = null;
                    await pending;
                    if (auth.currentUser) {
                        // Exchange succeeded; a fresh onAuthStateChanged(user) call
                        // is already in flight and will drive state from here.
                        return;
                    }
                }
                setIsAuthenticated(false);
                setUser(null);
                markAuthReady();
                return;
            }

            try {
                const idTokenResult = await timeout(getIdTokenResult(usr, true), 15000, 'AUTH_TOKEN_TIMEOUT');
                const claims = idTokenResult.claims || {};
                const claimRole = claimRoleFrom(claims);
                const isFounderBootstrap = founderEmailGrantsAdmin(usr.email);
                const claimsAdmin = claimsGrantAdmin(claims);

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
                const role = isFounderBootstrap ? 'super_admin' : (claimRole || profileRole || '');
                const isStaff = STAFF_ROLES.has(claimRole) || STAFF_ROLES.has(profileRole);

                if (!isAdmin && !isStaff) {
                    if (profileReadError && !claimsAdmin) {
                        throw new Error('ADMIN_PROFILE_LOOKUP_FAILED');
                    }
                    throw new Error('ADMIN_ACCESS_DENIED');
                }

                if (isFounderBootstrap && (!profile || profile.role !== 'super_admin' || profile.isAdmin !== true || profile.admin !== true)) {
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

                setUser({ ...usr, ...profile, role, isAdmin, claims, bootstrapAdmin: isFounderBootstrap });
                setIsAuthenticated(true);
                setError(null);

                if (!sessionStorage.getItem(`login_audit_${usr.uid}`)) {
                    sessionStorage.setItem(`login_audit_${usr.uid}`, 'true');
                    addDoc(collection(db, 'audit_logs'), {
                        actorId: usr.uid,
                        actorRole: role,
                        targetType: 'system',
                        targetId: 'admin-panel',
                        action: 'login',
                        userAgent: navigator.userAgent,
                        bootstrapAdmin: isFounderBootstrap,
                        createdAt: serverTimestamp()
                    }).catch(e => console.error("Audit log failed", e));
                }

                (async () => {
                    try {
                        const supported = await isSupported();
                        if (supported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                            const messaging = getMessaging(app);
                            const currentToken = await getToken(messaging, {
                                vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ'
                            });
                            if (currentToken) {
                                await updateDoc(doc(db, 'users', usr.uid), {
                                    fcmTokens: arrayUnion(currentToken),
                                    updatedAt: new Date().toISOString()
                                });
                            }
                        }
                    } catch (fcmErr) {
                        console.warn("🛡️ [AUTH] FCM harvest bypassed:", fcmErr);
                    }
                })();

            } catch (err: any) {
                console.error("🛡️ [AUTH] Admin Auth Error:", err);
                setIsAuthenticated(false);
                setUser(null);

                if (err.message === 'AUTH_TOKEN_TIMEOUT' || err.message === 'AUTH_SYNC_TIMEOUT') {
                    setError('Admin token check timed out. Use Reset & Login, then retry. If this persists, confirm bin-group-admin-panel.web.app and bin-group-admin-panel.firebaseapp.com are both listed under Firebase Authentication > Settings > Authorized domains.');
                } else if (err.message === 'ADMIN_PROFILE_TIMEOUT' || err.message === 'ADMIN_PROFILE_LOOKUP_FAILED') {
                    setError('Admin profile could not be verified from Firestore. Use the founder admin email or repair the /users profile/admin claims.');
                    await signOut(auth);
                } else if (err.message === 'ADMIN_ACCESS_DENIED') {
                    setError('This account does not have admin access. Use ceo@bin-groups.com or assign admin custom claims/profile role.');
                    await signOut(auth);
                } else {
                    setError('Admin login failed. Use Reset & Login, then try again.');
                }
            } finally {
                markAuthReady();
            }
        });

        return () => {
            window.clearTimeout(authStateWatchdog);
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const login = async (credentials: any) => {
        console.warn('[ADMIN-AUTH] login() is intentionally delegated to UnifiedLogin.', credentials?.email ? { email: credentials.email } : {});
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setIsAuthenticated(false);
            setUser(null);
            window.location.href = '/login';
        } catch (e) {
            window.location.reload();
        }
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, error, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
