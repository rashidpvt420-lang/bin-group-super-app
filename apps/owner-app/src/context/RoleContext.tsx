import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";

// Production Imports
import { 
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp, 
    isSupported, getMessaging, getToken, app, 
    onAuthStateChanged, User, arrayUnion
} from "../lib/firebase";        
import LegalModal from "../components/LegalModal";

declare global {
    interface Window {
        __BIN_GROUPS_BOOT__?: {
            staticReady?: boolean;
            reactMounted?: boolean;
            authReady?: boolean;
            startedAt?: number;
            mountedAt?: number;
        };
    }
}

export interface SovereignUser extends User {
    designStudioBeta?: boolean;
    role?: string;
    status?: string;
    isAdmin?: boolean;
    propertyId?: string;
    unitId?: string;
    onDuty?: boolean;
    dutyStatus?: string;
    emirate?: string;
    fcmTokens?: string[];
    platform?: string;
    isStandalone?: boolean;
    userAgent?: string;
    legalAcceptedAt?: string;
    adminApproved?: boolean;
    onboardingComplete?: boolean;
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
    refreshRole: () => Promise<void>;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 8000; // Increased for live sync robustness

const markGlobalAuthReady = () => {
    window.__BIN_GROUPS_BOOT__ = {
        ...(window.__BIN_GROUPS_BOOT__ || {}),
        authReady: true,
    };
};

export function RoleProvider({ children }: { children: any }) {
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
            const messagingSupported = await isSupported();
            if (!messagingSupported) return false;

            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const messaging = getMessaging(app);
                const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
                const readyRegistration = await navigator.serviceWorker.ready;
                
                const currentToken = await getToken(messaging, {
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ',
                    serviceWorkerRegistration: readyRegistration
                });
                
                if (currentToken) {
                    await updateDoc(doc(db, 'users', user.uid), {
                       fcmTokens: arrayUnion(currentToken),
                       updatedAt: new Date().toISOString()
                    });
                    return true;
                }
            }
            return false;
        } catch (err: any) {
            console.error("🛡️ [AUTH] Notification enablement failed:", err);
            return false;
        }
    };

    const syncProfile = async (currentUser: User) => {
        console.log("🔍 [AUTH_DIAG] syncProfile started for:", currentUser.uid);
        try {
            // 1. Force Token Refresh to pick up new Custom Claims
            console.log("🔍 [AUTH_DIAG] Requesting ID Token Result (Force Refresh)...");
            const tokenResult = await currentUser.getIdTokenResult(true);
            const claims = tokenResult.claims;
            console.log("🔍 [AUTH_DIAG] Custom Claims Detected:", claims);

            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                console.log("🔍 [AUTH_DIAG] Fetching Firestore profile...");
                snap = await getDoc(userDocRef);
            } catch (err: any) {
                console.error("📜 [ROLE-SYNC] Firestore read permission/error:", err);
                // If claim exists, we can still proceed
                if (claims.role) {
                    setRole(String(claims.role));
                    setIsAdmin(!!claims.admin);
                    setLoading(false);
                    return;
                }
                setRole('tenant'); // Default fallback
                setLoading(false);
                return;
            }

            if (snap && snap.exists()) {
                const data = snap.data();
                console.log("🔍 [AUTH_DIAG] Firestore Data Found:", data);
                
                setUser(prev => ({ ...currentUser, ...data } as any));

                // 2. Resolve Role (Priority: Claims > Firestore > Default)
                const resolvedRole = String(claims.role || data.role || 'tenant').toLowerCase();
                const resolvedStatus = (data.status || 'active').toLowerCase();
                const resolvedIsAdmin = !!(claims.admin || data.isAdmin || data.role === 'admin');

                setRole(resolvedRole);
                setStatus(resolvedStatus);
                setIsAdmin(resolvedIsAdmin);
                setPropertyId(data.propertyId || data.unitId || null);
                setLegalAccepted(!!data.legalAcceptedAt);

                if (resolvedStatus === 'pending_approval') {
                    setError("ACCOUNT PENDING APPROVAL: Verification in progress.");
                } else {
                    setError(null);
                }

            } else {
                console.warn("🔍 [AUTH_DIAG] No Firestore document at users/" + currentUser.uid);
                // Create profile if missing but user is authenticated
                if (!claims.role) {
                    console.log("🔍 [AUTH_DIAG] Auto-initializing missing Firestore profile...");
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
                }
                
                setRole(String(claims.role || 'tenant'));
                setIsAdmin(!!claims.admin);
                setStatus('active');
                setLoading(false);
            }
        } catch (err: any) {
            console.error("📜 [ROLE-SYNC] Fatal failure:", err);
            setError("IDENTITY SYNC FAULT: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const refreshRole = async () => {
        if (auth.currentUser) {
            setLoading(true);
            await syncProfile(auth.currentUser);
        }
    };

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    useEffect(() => {
        let unsubscribe: () => void = () => {};

        const initAuth = async () => {
            console.log("🔍 [AUTH_DIAG] Initializing Sovereign Identity Bridge...");
            try {
                unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    console.log("🔍 [AUTH_DIAG] Auth State Changed. User:", currentUser?.email || 'NULL');
                    if (currentUser) {
                        await syncProfile(currentUser);
                    } else {
                        setUser(null);
                        setRole(null);
                        setStatus(null);
                        setIsAdmin(false);
                        setPropertyId(null);
                        setLegalAccepted(true);
                        setError(null);
                        setLoading(false);
                    }
                    markGlobalAuthReady();
                }, (err) => {
                    console.error("❌ [AUTH_DIAG] Auth Observer Error:", err);
                    setError("PROTOCOL VIOLATION: " + err.message);
                    setLoading(false);
                });

                // Fail-safe timeout to prevent infinite loading
                setTimeout(() => {
                    if (loadingRef.current) {
                        console.warn("⚠️ [AUTH_DIAG] Auth Sync Timeout. Bypassing blocker.");
                        setLoading(false);
                    }
                }, AUTH_BOOT_TIMEOUT_MS);

            } catch (fatalErr: any) {
                console.error("❌ [AUTH-BOOT] Bridge Failure:", fatalErr);
                setError("IDENTITY FAULT: " + fatalErr.message);
                setLoading(false);
            }
        };

        initAuth();
        return () => unsubscribe && unsubscribe();
    }, []);

    return (
        <RoleContext.Provider value={{ role, status, isAdmin, loading, error, user, propertyId, legalAccepted, enableNotifications, refreshRole }}>
            {user && !legalAccepted && !loading && !error && (
                <LegalModal userId={user.uid} onAccepted={() => setLegalAccepted(true)} />
            )}
            {children as any}
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
