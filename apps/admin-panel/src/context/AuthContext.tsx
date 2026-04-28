import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, onAuthStateChanged } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { getDoc, doc, updateDoc, arrayUnion, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { isSupported, getMessaging, getToken, app } from '../lib/firebase';

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

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string) => {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) => setTimeout(() => reject(new Error(label)), ms)),
    ]);
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
                const bootWindow = window as typeof window & { __BIN_GROUPS_BOOT__?: Record<string, unknown> };
                bootWindow.__BIN_GROUPS_BOOT__ = {
                    ...(bootWindow.__BIN_GROUPS_BOOT__ || {}),
                    authReady: true,
                };
            }
            console.log("🔍 [DIAG] Admin Auth handshake marked as READY.");
        };

        setTimeout(markAuthReady, 10000);

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            console.log("🛡️ [AUTH] State Changed:", usr ? usr.email : "LOGGED_OUT");
            try {
                if (usr) {
                    console.log("🛡️ [AUTH] Syncing Profile for:", usr.uid);
                    try {
                        const idTokenResult = await withTimeout(usr.getIdTokenResult(true), 10000, 'AUTH_TOKEN_TIMEOUT') as any;
                        const claims = idTokenResult?.claims || {};
                        let data: Record<string, any> = {};
                        let profileReadFailed = false;

                        try {
                            const userDoc = await withTimeout(getDoc(doc(db, 'users', usr.uid)), 10000, 'ADMIN_PROFILE_TIMEOUT') as any;
                            data = userDoc.exists() ? userDoc.data() : {};
                        } catch (profileErr) {
                            profileReadFailed = true;
                            console.warn("🛡️ [AUTH] Admin profile read skipped:", profileErr);
                        }

                        const claimRole = typeof claims.role === 'string' ? claims.role : undefined;
                        const profileRole = typeof data.role === 'string' ? data.role : undefined;
                        const resolvedRole = claimRole || profileRole || (claims.admin === true ? 'admin' : undefined);
                        const hasAdminAccess =
                            claims.admin === true ||
                            claims.super_admin === true ||
                            data.isAdmin === true ||
                            (resolvedRole ? ADMIN_ROLES.has(resolvedRole) : false);

                        console.log("🛡️ [AUTH] Identity Resolved. Role:", resolvedRole || 'none', "ProfileReadFailed:", profileReadFailed);

                        if (hasAdminAccess) {
                            setUser({ ...usr, ...data, role: resolvedRole || 'admin', claims });
                            setIsAuthenticated(true);
                            setError(null);

                                (async () => {
                                    try {
                                        const messagingSupported = await isSupported();
                                        if (messagingSupported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                            const messaging = getMessaging(app);
                                            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                                            const swReadyPromise = navigator.serviceWorker.ready;
                                            const swTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error("SW_TIMEOUT")), 5000));

                                            await Promise.race([swReadyPromise, swTimeout]);
                                            const currentToken = await getToken(messaging, {
                                                vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                                                serviceWorkerRegistration: registration
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

                                if (!sessionStorage.getItem(`login_audit_${usr.uid}`)) {
                                    sessionStorage.setItem(`login_audit_${usr.uid}`, 'true');
                                    addDoc(collection(db, 'audit_logs'), {
                                        actorId: usr.uid,
                                        actorRole: resolvedRole || 'admin',
                                        targetType: 'system',
                                        targetId: 'admin-panel',
                                        action: 'login',
                                        before: null,
                                        after: 'active',
                                        userAgent: navigator.userAgent,
                                        createdAt: serverTimestamp()
                                    }).catch(e => console.error("Audit log failed", e));
                                }

                            } else {
                                console.warn("🛡️ [AUTH] ACCESS DENIED: Insufficient clearance for:", usr.email);
                                setError("This account is not authorized for the Admin Command Center.");
                                setIsAuthenticated(false);
                                setUser(null);
                                await signOut(auth);
                        }
                    } catch (firestoreErr: any) {
                        console.error("🛡️ [AUTH] Firestore Sync Error:", firestoreErr);
                        setError("We could not verify your admin session. Please retry or contact support if this continues.");
                        setIsAuthenticated(false);
                        setUser(null);
                    } finally {
                        markAuthReady();
                    }
                } else {
                    setIsAuthenticated(false);
                    setUser(null);
                    markAuthReady();
                }
            } catch (err: any) {
                console.error("🛡️ [AUTH] System Fault:", err);
                setError("System Initialization Fault: " + (err.message || 'Unknown'));
                setIsAuthenticated(false);
                markAuthReady();
            } finally {
                console.log("🔍 [DIAG] Admin Auth loading sequence finished.");
            }
        }, (err) => {
            console.error("🛡️ [AUTH] Fatal Observer Error:", err);
            setError("Authentication Observer Fault.");
            markAuthReady();
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const login = async (credentials: any) => {
    };

    const logout = async () => {
        try {
            await signOut(auth);
            setIsAuthenticated(false);
            setUser(null);
            window.location.href = '/admin/login';
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
