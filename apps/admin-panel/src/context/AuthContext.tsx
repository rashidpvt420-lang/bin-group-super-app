import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, onAuthStateChanged, app } from '../lib/firebase';
import { signOut, getIdTokenResult } from 'firebase/auth';
import { getDoc, doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
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

const BOOTSTRAP_ADMIN_EMAILS = new Set(
    (process.env.REACT_APP_FOUNDER_ADMIN_EMAILS || 'rashid.pvt420@gmail.com')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
);

const claimRoleFrom = (claims: Record<string, unknown>) => String(claims.role || claims.userRole || claims.primaryRole || '').trim().toLowerCase();
const profileRoleFrom = (profile: any) => String(profile?.role || profile?.userRole || profile?.primaryRole || '').trim().toLowerCase();
const canonicalEmail = (value: unknown) => {
    const email = String(value || '').trim().toLowerCase();
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
    const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
    return `${normalizedLocal}@${normalizedDomain}`;
};

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

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            console.log("🛡️ [AUTH] State Changed:", usr ? usr.email : "LOGGED_OUT");
            
            if (!usr) {
                setIsAuthenticated(false);
                setUser(null);
                setError(null);
                markAuthReady();
                return;
            }

            try {
                const timeoutPromise = new Promise<never>((_, reject) => {
                    setTimeout(() => reject(new Error("AUTH_SYNC_TIMEOUT")), 15000);
                });

                const authResolutionPromise = Promise.all([
                    getIdTokenResult(usr, true),
                    getDoc(doc(db, "users", usr.uid)),
                ]);

                const [idTokenResult, userDoc] = await Promise.race([
                    authResolutionPromise,
                    timeoutPromise,
                ]);

                const claims = idTokenResult.claims || {};
                const profile = userDoc.exists() ? userDoc.data() : null;
                const claimRole = claimRoleFrom(claims);
                const profileRole = profileRoleFrom(profile);
                const isFounderBootstrap = founderEmailGrantsAdmin(usr.email);
                const isAdmin = claimsGrantAdmin(claims) || profileGrantsAdmin(profile) || isFounderBootstrap;
                const role = claimRole || profileRole || (isFounderBootstrap ? 'super_admin' : '');

                if (!isAdmin) {
                    throw new Error("ADMIN_ACCESS_DENIED");
                }

                setUser({ ...usr, ...profile, role, isAdmin: true, claims, bootstrapAdmin: isFounderBootstrap });
                setIsAuthenticated(true);
                setError(null);

                // Audit Log (Once per session)
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

                // Optional FCM Sync
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

                if (err.message === "AUTH_SYNC_TIMEOUT") {
                    setError("Admin session check timed out. Please retry.");
                } else if (err.message === "ADMIN_ACCESS_DENIED") {
                    setError("This account does not have admin access.");
                    await signOut(auth);
                } else {
                    setError("Admin login failed. Please try again.");
                }
            } finally {
                markAuthReady();
            }
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const login = async (credentials: any) => {
        // Implementation provided by UnifiedLogin or direct firebase call
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
