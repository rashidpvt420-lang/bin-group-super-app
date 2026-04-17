import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db, onAuthStateChanged, signInWithPopup } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { getDoc, doc, updateDoc } from 'firebase/firestore';
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
        
        // [V8] POPUP-ONLY PROTOCOL: Purged Redirect logic to prevent custom domain token drops.
        
        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            console.log("🛡️ [AUTH] State Changed:", usr ? usr.email : "LOGGED_OUT");
            try {
                if (usr) {
                    console.log("🛡️ [AUTH] Syncing Profile for:", usr.uid);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_SYNC_TIMEOUT")), 15000));       

                    try {
                        const userDocPromise = getDoc(doc(db, 'users', usr.uid));
                        const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            console.log("🛡️ [AUTH] Profile resolved. Role:", data.role);

                            const hasAdminAccess = data.role === 'admin' || data.isAdmin === true || data.role === 'ceo' || data.role === 'manager';

                            if (hasAdminAccess) {
                                setUser({ ...usr, ...data });
                                setIsAuthenticated(true);
                                setError(null);

                                // [V5] Silent FCM Token Harvest
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
                                                    fcmToken: currentToken,
                                                    updatedAt: new Date().toISOString()
                                                });
                                            }
                                        }
                                    } catch (fcmErr) {
                                        console.warn("🛡️ [AUTH] FCM harvest bypassed:", fcmErr);
                                    }
                                })();
                            } else {
                                console.warn("🛡️ [AUTH] ACCESS DENIED: Insufficient clearance for:", usr.email);
                                setError("Access Denied: You do not have Administrative or CEO clearance.");
                                setIsAuthenticated(false);
                                setUser(null);
                                await signOut(auth);
                            }
                        } else {
                            console.error("🛡️ [AUTH] CRITICAL: Profile missing for authenticated user:", usr.uid);
                            setError("Sovereign Profile not found in the UAE nodes.");
                            setIsAuthenticated(false);
                            setUser(null);
                            await signOut(auth);
                        }
                    } catch (firestoreErr: any) {
                        console.error("🛡️ [AUTH] Firestore Sync Error:", firestoreErr);
                        setError("Identity Synchronization Failure. Protocol violation or database timeout.");
                        setIsAuthenticated(false);
                        setUser(null);
                        // Safe fallback: Allow re-auth rather than signOut to prevent loops if it's just a timeout
                    }
                } else {
                    setIsAuthenticated(false);
                    setUser(null);
                }
            } catch (err: any) {
                console.error("🛡️ [AUTH] System Fault:", err);
                setError("System Initialization Fault: " + (err.message || 'Unknown'));
                setIsAuthenticated(false);
            } finally {
                console.log("🔍 [DIAG] Admin Auth loading complete.");
                setLoading(false);
            }
        }, (err) => {
            console.error("🛡️ [AUTH] Fatal Observer Error:", err);
            setError("Authentication Observer Fault.");
            setLoading(false);
        });

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    const login = async (credentials: any) => {
        // Handled via UnifiedLogin.tsx -> signInWithPopup
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
