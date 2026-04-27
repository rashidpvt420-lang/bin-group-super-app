import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { 
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp, 
    isSupported, getMessaging, getToken, app, 
    onAuthStateChanged, getRedirectResult, User, arrayUnion
} from "../lib/firebase";        
import LegalModal from "../components/LegalModal";

export interface SovereignUser extends User {
    designStudioBeta?: boolean;
    role?: string;
    status?: string;
    isAdmin?: boolean;
    propertyId?: string;
    unitId?: string;
}

interface RoleContextType {
    role: string | null;
    status: string | null;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
    user: SovereignUser | null;
    propertyId: string | null;
    legalAccepted: boolean;
    enableNotifications: () => Promise<boolean>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 6000;

const markGlobalAuthReady = () => {
    window.__BIN_GROUPS_BOOT__ = {
        ...(window.__BIN_GROUPS_BOOT__ || {}),
        authReady: true,
    };
};

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [user, setUser] = useState<SovereignUser | null>(null);
    const [propertyId, setPropertyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [legalAccepted, setLegalAccepted] = useState(true);
    const loadingRef = useRef(loading);

    const enableNotifications = async (): Promise<boolean> => {
        if (!user) return false;
        try {
            console.log("🛡️ [AUTH] Notification Handshake Initiated. Current Origin:", window.location.origin);
            const messagingSupported = await isSupported();
            console.log("🛡️ [AUTH] Messaging Supported:", messagingSupported);
            if (!messagingSupported) return false;

            const permission = await Notification.requestPermission();
            console.log("🛡️ [AUTH] Permission Status:", permission);
            if (permission === 'granted') {
                const messaging = getMessaging(app);
                console.log("🛡️ [AUTH] Registering Service Worker...");
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                const swReadyPromise = navigator.serviceWorker.ready;
                const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SW_READY_TIMEOUT")), 5000));

                console.log("🛡️ [AUTH] Awaiting SW Ready state...");
                const readyRegistration = await Promise.race([swReadyPromise, timeoutPromise]) as ServiceWorkerRegistration;
                
                console.log("🛡️ [AUTH] Requesting FCM Token...");
                const currentToken = await getToken(messaging, {
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                    serviceWorkerRegistration: readyRegistration
                });
                
                if (currentToken) {
                    console.log("🛡️ [AUTH] FCM Token Obtained Successfully.");
                    const userAgent = window.navigator.userAgent.toLowerCase();
                    const isIOS = /iphone|ipad|ipod/.test(userAgent);
                    const isStandalone = ('standalone' in window.navigator) && (window.navigator as any).standalone;

                    await updateDoc(doc(db, 'users', user.uid), {
                       fcmTokens: arrayUnion(currentToken),
                       platform: isIOS ? 'ios' : 'android',
                       isStandalone: !!isStandalone,
                       userAgent: window.navigator.userAgent,
                       updatedAt: new Date().toISOString()
                    });

                    console.log("🛡️ [AUTH] Firestore Sync Complete.");
                    return true;
                }
            }
            return false;
        } catch (err: any) {
            console.error("🛡️ [AUTH] Notification enablement failed:", {
                code: err.code,
                message: err.message,
                origin: window.location.origin
            });
            return false;
        }
    };

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        let unsubscribe: () => void = () => {};

        const initAuth = async () => {
            console.log("🔍 [DIAG] Starting initAuth...");
            try {
                // [V8] POPUP-ONLY PROTOCOL: Redirect logic removed to prevent cross-origin token drop.
                console.log("💎 [BOOT] Sovereign RoleProvider Mounted. Watchdog Armed.");

                const syncProfile = async (currentUser: User) => {
                    console.log("🔍 [DIAG] syncProfile started for:", currentUser.uid);
                    try {
                        const userDocRef = doc(db, "users", currentUser.uid);
                        let snap;

                        try {
                            console.log("🔍 [DIAG] Fetching Firestore profile...");
                            const fetchPromise = getDoc(userDocRef);
                            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("FIRESTORE_TIMEOUT")), AUTH_BOOT_TIMEOUT_MS));
                            snap = await Promise.race([fetchPromise, timeoutPromise]) as any;
                            console.log("🔍 [DIAG] Firestore profile fetch result:", snap?.exists() ? "Exists" : "Does not exist");
                        } catch (err: any) {
                            console.error("📜 [ROLE-SYNC] Permission Denied, Timeout, or Fetch Error:", err);
                            console.log("🔍 [DIAG] Falling back to default tenant role due to fetch error.");
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
                                console.log("🔍 [DIAG] New profile created.");
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
                            console.log("🔍 [DIAG] Profile data loaded:", JSON.stringify({ role: data.role, status: data.status, isAdmin: data.isAdmin }));
                            
                            // Enrich the user object with profile data including designStudioBeta
                            setUser(prev => prev ? { ...prev, ...data } : null);

                            const currentStatus = (data.status || 'active').toUpperCase();

                            if (currentStatus === 'PENDING_APPROVAL') {
                                setRole(data.role?.toLowerCase() || 'owner');
                                setStatus('PENDING_APPROVAL');
                                setIsAdmin(false);
                                setError("ACCOUNT PENDING APPROVAL: Your contract and bank details are currently being verified.");
                                console.log("🔍 [DIAG] Status: PENDING_APPROVAL");
                                return;
                            }

                            setRole(data.role?.toLowerCase() || 'tenant');
                            setStatus(currentStatus.toLowerCase());
                            setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                            setPropertyId(data.propertyId || data.unitId || null);
                            setLegalAccepted(!!data.legalAcceptedAt);

                            setError(null);
                            console.log("🔍 [DIAG] Role resolution complete:", data.role);

                            // [V5] Silent FCM Token Harvest
                            (async () => {
                                try {
                                    const messagingSupported = await isSupported();
                                    if (messagingSupported && typeof Notification !== 'undefined' && Notification.permission === 'granted') {
                                        console.log("🛡️ [AUTH] Silent FCM Harvest Initiated.");
                                        const messaging = getMessaging(app);
                                        const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });     
                                        const swReadyPromise = navigator.serviceWorker.ready;
                                        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("SW_READY_TIMEOUT")), 5000));

                                        try {
                                            const readyRegistration = await Promise.race([swReadyPromise, timeoutPromise]) as ServiceWorkerRegistration;
                                            const currentToken = await getToken(messaging, {
                                                vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',  
                                                serviceWorkerRegistration: readyRegistration
                                            });
                                            if (currentToken) {
                                                console.log("🛡️ [AUTH] Silent FCM Token Obtained.");
                                                await updateDoc(doc(db, 'users', currentUser.uid), {
                                                    fcmTokens: arrayUnion(currentToken),
                                                    updatedAt: new Date().toISOString()
                                                });
                                            }
                                        } catch (raceErr: any) {
                                            console.warn("🛡️ [AUTH] Silent Harvest failed:", raceErr.code || raceErr.message);
                                        }
                                    }
                                } catch (notifErr) {
                                    console.warn("🛡️ [AUTH] Silent Harvest bypass:", notifErr);
                                }
                            })();

                        } else {
                            console.log("🔍 [DIAG] Snap exists but invalid. Defaulting to tenant.");
                            setRole('tenant');
                            setStatus('active');
                        }
                    } catch (err: any) {
                        console.error("📜 [ROLE-SYNC] Fatal context resolution failure:", err);
                        setRole('tenant');
                        setStatus('active');
                    } finally {
                        console.log("🔍 [DIAG] syncProfile finished, setting loading=false");
                        setLoading(false);
                    }
                };

                console.log("🔍 [DIAG] Setting up onAuthStateChanged...");

                let profileSyncResolved = false;
                const markAuthReady = () => {
                    if (profileSyncResolved) return;
                    profileSyncResolved = true;
                    setLoading(false);
                    markGlobalAuthReady();
                    console.log("🔍 [DIAG] Auth handshake marked as READY.");
                };

                // Fallback timeout to prevent deadlock on public pages
                setTimeout(markAuthReady, AUTH_BOOT_TIMEOUT_MS);

                unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    console.log("🛡️ [AUTH] onAuthStateChanged:", currentUser ? currentUser.email : "Logged Out");
                    setUser(currentUser);
                    if (currentUser) {
                        console.log("🛡️ [AUTH] Syncing Profile for:", currentUser.email);
                        try {
                            await syncProfile(currentUser);
                        } finally {
                            markAuthReady();
                        }
                    } else {
                        console.log("🔍 [DIAG] User is null, clearing state and setting loading=false");
                        setRole(null);
                        setStatus(null);
                        setIsAdmin(false);
                        setPropertyId(null);
                        setError(null);
                        setLegalAccepted(true);
                        markAuthReady();
                    }
                }, (err) => {
                    console.error("[ROLE-SYNC] Fatal Auth Observer Error:", err);
                    setError("Authentication Protocol Violation: " + err.message);
                    markAuthReady();
                });

            } catch (fatalErr: any) {
                console.error("❌ [AUTH-BOOT] Fatal Identity Bridge Failure:", fatalErr);
                setError("IDENTITY FAULT: " + fatalErr.message);
                markGlobalAuthReady();
                setLoading(false);
            }
        };

        initAuth();

        return () => {
            if (unsubscribe) unsubscribe();
        };
    }, []);

    return (
        <RoleContext.Provider value={{ role, status, isAdmin, loading, error, user, propertyId, legalAccepted, enableNotifications }}>
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
