import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { getDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
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
        const safetyTimeout = setTimeout(() => {
            if (loadingRef.current) {
                console.error("[AUTH] BIN-CRITICAL: Auth initialization stalled.");
                setError("Sovereign Identity initialization timed out.");
                setLoading(false);
            }
        }, 10000);

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            if (usr) {
                try {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_SYNC_TIMEOUT")), 5000));
                    try {
                        const userDocPromise = getDoc(doc(db, 'users', usr.uid));
                        const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

                        if (userDoc.exists()) {
                            const data = userDoc.data();
                            if (data.role === 'admin' || data.isAdmin === true) {
                                setUser({ ...usr, ...data });
                                setIsAuthenticated(true);
                                setError(null);

                                // [V5] Silent FCM Token Harvest
                                try {
                                    const messagingSupported = await isSupported();
                                    if (messagingSupported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                        const messaging = getMessaging(app);
                                        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                                        await navigator.serviceWorker.ready;
                                        const currentToken = await getToken(messaging, { 
                                            vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                                            serviceWorkerRegistration: registration 
                                        });
                                        if (currentToken) {
                                            // YOU MUST WRITE THE TOKEN TO FIRESTORE
                                            await updateDoc(doc(db, 'users', usr.uid), {
                                                fcmToken: currentToken,
                                                updatedAt: new Date().toISOString()
                                            });
                                            console.log("Token saved to user profile.");
                                        }
                                    }
                                } catch (notifErr) {
                                    console.warn("📍 [V5] Admin Silent Token Harvest bypass/failed:", notifErr);
                                }
                            } else {
                                console.warn("[AUTH] Denying access: Not an admin", usr.email);
                                setError("Access Denied: Administrative credentials required.");
                                await signOut(auth);
                                setIsAuthenticated(false);
                                setUser(null);
                            }
                        } else {
                            console.warn("[AUTH] Denying access: No profile found", usr.email);
                            setError("Sovereign Profile not found.");
                            await signOut(auth);
                            setIsAuthenticated(false);
                            setUser(null);
                        }
                    } catch (firestoreErr: any) {
                        console.error("[AUTH] Firestore Fetch Error:", firestoreErr);
                        // [BULLETPROOF] On permission error, gracefully logout instead of crashing
                        setError("Sovereign Protocol Violation: Your account has insufficient clearance for this administrative portal.");
                        await signOut(auth);
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                } catch (err: any) {
                    console.error('📍 [AUTH] Fatal sequence transition fault:', err);
                    setError(err.message || "Identity synchronization failed.");
                    setIsAuthenticated(false);
                    setUser(null);
                    await signOut(auth);
                } finally {
                    setLoading(false);
                    clearTimeout(safetyTimeout);
                }
            } else {
                setIsAuthenticated(false);
                setUser(null);
                setLoading(false);
                clearTimeout(safetyTimeout);
            }
        }, (err) => {
            console.error("[AUTH] Fatal Auth Observer Error:", err);
            setError("Fatal Authentication Fault: " + err.message);
            setLoading(false);
            clearTimeout(safetyTimeout);
        });

        return () => {
            unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, []);

    const login = async (credentials: any) => {
    };

    const logout = async () => {
        await signOut(auth);
        setIsAuthenticated(false);
        setUser(null);
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
