import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut, getRedirectResult } from 'firebase/auth';
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
        // [STABILITY] Explicitly resolve redirect results for cross-domain institutional flows
        getRedirectResult(auth).then((result) => {
            if (result) {
                console.log("🛡️ [AUTH] Identity verification recovered for:", result.user.email);
            }
        }).catch((err) => {
            console.error("🛡️ [AUTH] Redirect resolution fault:", err);
            setError(`Identity Verification Fault: ${err.message}`);
        });

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            try {
                if (usr) {
                    console.log("🛡️ [AUTH] Watchdog detected user:", usr.email);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_SYNC_TIMEOUT")), 20000));
                    
                    try {
                        const userDocPromise = getDoc(doc(db, 'users', usr.uid));
                        const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            console.log("🛡️ [AUTH] Profile data resolved:", data.role);
                            
                            // [ROLE-EXPANSION] Allow CEO and Manager roles to access Admin Terminal
                            const hasAdminAccess = data.role === 'admin' || data.isAdmin === true || data.role === 'ceo' || data.role === 'manager';
                            
                            if (hasAdminAccess) {
                                setUser({ ...usr, ...data });
                                setIsAuthenticated(true);
                                setError(null);

                                // [V5] Silent FCM Token Harvest - DECOUPLED
                                setTimeout(async () => {
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
                                        console.warn("[AUTH] FCM harvest bypassed:", fcmErr);
                                    }
                                }, 1000);
                            } else {
                                setError("Access Denied: You do not have Administrative or CEO clearance.");
                                setIsAuthenticated(false);
                                setUser(null);
                                await signOut(auth);
                            }
                        } else {
                            setError("Sovereign Profile not found in the UAE nodes.");
                            setIsAuthenticated(false);
                            setUser(null);
                            await signOut(auth);
                        }
                    } catch (firestoreErr: any) {
                        setError("Identity Synchronization Failure. Protocol violation or database timeout.");
                        setIsAuthenticated(false);
                        setUser(null);
                        await signOut(auth);
                    }
                } else {
                    setIsAuthenticated(false);
                    setUser(null);
                    // [FIX] DO NOT clear the error when usr is null, as it wipes the "Access Denied" message
                }
            } catch (err: any) {
                setError("System Initialization Fault: " + (err.message || 'Unknown'));
                setIsAuthenticated(false);
            } finally {
                setLoading(false);
            }
        }, (err) => {
            console.error("🛡️ [AUTH] Observer error:", err);
            setError("Authentication Observer Fault.");
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    const login = async (credentials: any) => {
        // Implementation handled by components calling firebase directly for now
    };

    const logout = async () => {
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
        window.location.href = '/admin/login';
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
