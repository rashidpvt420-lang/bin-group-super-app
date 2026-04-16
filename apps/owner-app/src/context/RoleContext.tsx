import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { onAuthStateChanged, User, signOut, getRedirectResult } from "firebase/auth";
import { db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp, isSupported, getMessaging, getToken, app } from "../lib/firebase";
import LegalModal from "../components/LegalModal";

interface RoleContextType {
    role: string | null;
    status: string | null;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
    user: User | null;
    propertyId: string | null;
    legalAccepted: boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [propertyId, setPropertyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [legalAccepted, setLegalAccepted] = useState(true);
    const loadingRef = useRef(loading);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        // Handle Redirect Result immediately on mount to clear any pending auth state
        getRedirectResult(auth).then((result) => {
            if (result) {
                console.log("🛡️ [AUTH] Redirect result obtained for:", result.user.email);
            }
        }).catch((err) => {
            console.warn("🛡️ [AUTH] Non-fatal redirect recovery warning:", err.message);
            // DO NOT set global error here to avoid blocking login UI
        });

        console.log("💎 [BOOT] Sovereign RoleProvider Mounted. Watchdog Armed.");

        const syncProfile = async (currentUser: User) => {
            try {
                const userDocRef = doc(db, "users", currentUser.uid);
                let snap;

                try {
                    const fetchPromise = getDoc(userDocRef);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), 10000));
                    snap = await Promise.race([fetchPromise, timeoutPromise]) as any;
                } catch (err: any) {
                    console.error("📜 [ROLE-SYNC] Permission Denied, Timeout, or Fetch Error:", err);
                    setRole('tenant');
                    setStatus('active');
                    setIsAdmin(false);
                    return;
                }

                if (snap && !snap.exists()) {
                    console.log("📜 [ROLE-SYNC] Profile missing. Creating sovereign tenant profile...");
                    try {
                        const newProfile = {
                            uid: currentUser.uid,
                            email: (currentUser.email || '').toLowerCase(),
                            displayName: currentUser.displayName || "New User",
                            role: 'tenant',
                            isAdmin: false,
                            status: 'active',
                            createdAt: serverTimestamp()
                        };
                        await setDoc(userDocRef, newProfile);
                        snap = await getDoc(userDocRef);
                    } catch (err) {
                        console.error("📜 [ROLE-SYNC] Profile creation failed:", err);
                        setRole('tenant');
                        setStatus('active');
                        return;
                    }
                }

                if (snap && snap.exists()) {
                    const data = snap.data();
                    const currentStatus = (data.status || 'active').toUpperCase();

                    if (currentStatus === 'PENDING_APPROVAL') {
                        setRole(data.role?.toLowerCase() || 'owner');
                        setStatus('PENDING_APPROVAL');
                        setIsAdmin(false);
                        setError("ACCOUNT PENDING APPROVAL: Your contract and bank details are currently being verified.");
                        return;
                    }

                    setRole(data.role?.toLowerCase() || 'tenant');
                    setStatus(currentStatus.toLowerCase());
                    setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                    setPropertyId(data.propertyId || data.unitId || null);
                    setLegalAccepted(!!data.legalAcceptedAt);

                    setError(null);

                    // [V5] Silent FCM Token Harvest
                    (async () => {
                        try {
                            const messagingSupported = await isSupported();
                            if (messagingSupported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                const messaging = getMessaging(app);
                                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                                const swReadyPromise = navigator.serviceWorker.ready;
                                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SW_READY_TIMEOUT")), 5000));

                                try {
                                    await Promise.race([swReadyPromise, timeoutPromise]);
                                    const currentToken = await getToken(messaging, {
                                        vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                                        serviceWorkerRegistration: registration
                                    });
                                    if (currentToken) {
                                        await updateDoc(doc(db, 'users', currentUser.uid), {
                                            fcmToken: currentToken,
                                            updatedAt: new Date().toISOString()
                                        });
                                    }
                                } catch (raceErr) {
                                    console.warn("📜 [V5] SW Ready timeout or getToken failed:", raceErr);
                                }
                            }
                        } catch (notifErr) {
                            console.warn("📜 [V5] Silent Token Harvest bypass/failed:", notifErr);
                        }
                    })();

                } else {
                    setRole('tenant');
                    setStatus('active');
                }
            } catch (err: any) {
                console.error("📜 [ROLE-SYNC] Fatal context resolution failure:", err);
                setRole('tenant');
                setStatus('active');
            }
        };

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                console.log("🛡️ [AUTH] Syncing Profile for:", currentUser.email);
                await syncProfile(currentUser);
                setLoading(false);
            } else {
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setError(null);
                setLegalAccepted(true);
                setLoading(false);
            }
        }, (err) => {
            console.error("[ROLE-SYNC] Fatal Auth Observer Error:", err);
            setError("Authentication Protocol Violation: " + err.message);
            setLoading(false);
        });

        return () => {
            unsubscribe();
        };
    }, []);

    return (
        <RoleContext.Provider value={{ role, status, isAdmin, loading, error, user, propertyId, legalAccepted }}>
            {user && !legalAccepted && !loading && !error && (
                <LegalModal userId={user.uid} onAccepted={() => setLegalAccepted(true)} />
            )}
            {children}
        </RoleContext.Provider>
    );
}

export function useRole() {
    const context = useContext(RoleContext);
    if (context === undefined) {
        throw new Error("useRole must be used within a RoleProvider");
    }
    return context;
}
