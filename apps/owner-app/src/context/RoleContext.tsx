import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
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
        const safetyTimeout = setTimeout(() => {
            if (loadingRef.current) {
                console.error("[ROLE-SYNC] BIN-CRITICAL: Role synchronization stalled.");
                setError("Role synchronization timed out.");
                setLoading(false);
            }
        }, 15000);

        console.log("💎 [BOOT] Sovereign RoleProvider Mounted. Watchdog Armed.");

        const syncProfile = async (currentUser: User) => {
            try {
                const userDocRef = doc(db, "users", currentUser.uid);
                let snap;
                
                try {
                    snap = await getDoc(userDocRef);
                } catch (err: any) {
                    console.error("📍 [ROLE-SYNC] Permission Denied or Fetch Error:", err);
                    setRole('tenant');
                    setStatus('active');
                    setIsAdmin(false);
                    setLoading(false);
                    return;
                }
                
                if (snap && !snap.exists()) {
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
                        console.error("📍 [ROLE-SYNC] Profile creation failed:", err);
                        setRole('tenant');
                        setStatus('active');
                        setLoading(false);
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
                        setError("ACCOUNT PENDING APPROVAL: Your contract and bank details are currently being verified by BIN GROUP compliance. Please contact support@bin-groups.com if this persists for > 24 hours.");
                        setLoading(false);
                        return;
                    }

                    setRole(data.role?.toLowerCase() || 'tenant');
                    setStatus(currentStatus.toLowerCase());
                    const isHighPrivilege = data.role?.toLowerCase() === 'admin' || data.isAdmin === true || data.role?.toLowerCase() === 'owner';
                    setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                    setPropertyId(data.propertyId || null);
                    setLegalAccepted(!!data.legalAcceptedAt);

                    // [V6.4] Institutional MFA/2FA Enforcement
                    if (isHighPrivilege) {
                        const enrolledFactors = (currentUser as any).multiFactor?.enrolledFactors || [];
                        if (enrolledFactors.length === 0) {
                            console.warn("🛡️ [MFA-ENFORCEMENT] High-privilege access attempt without second factor.");
                            setError("INSTITUTIONAL MFA REQUIRED: Your account role (ADMIN/OWNER) requires Multi-Factor Authentication for UAE PDPL compliance. Please visit your Account Security settings or contact hq@bin-groups.com to enable 2FA.");
                            setLoading(false);
                            return;
                        }
                    }

                    setError(null);

                    // [V5] Silent FCM Token Harvest - NON-BLOCKING
                    (async () => {
                        try {
                            const messagingSupported = await isSupported();
                            if (messagingSupported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                const messaging = getMessaging(app);
                                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                                // Using a timeout for service worker ready to prevent indefinite hangs
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
                                        console.log("Token saved to user profile.");
                                    }
                                } catch (raceErr) {
                                    console.warn("📍 [V5] SW Ready timeout or getToken failed:", raceErr);
                                }
                            }
                        } catch (notifErr) {
                            console.warn("📍 [V5] Silent Token Harvest bypass/failed:", notifErr);
                        }
                    })();

                } else {
                    setRole('tenant');
                    setStatus('active');
                }
            } catch (err: any) {
                console.error("📍 [ROLE-SYNC] Fatal context resolution failure:", err);
                setRole('tenant');
                setStatus('active');
            }
        };

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                await syncProfile(currentUser);
            } else {
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setError(null);
                setLegalAccepted(true);
            }
            setLoading(false);
            clearTimeout(safetyTimeout);
        }, (err) => {
            console.error("[ROLE-SYNC] Fatal Auth Observer Error:", err);
            setError("Fatal Authorization Fault: " + err.message);
            setLoading(false);
            clearTimeout(safetyTimeout);
        });

        return () => {
            unsubscribe();
            clearTimeout(safetyTimeout);
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
