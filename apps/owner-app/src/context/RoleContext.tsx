import React, { createContext, useContext, useEffect, useState, useRef } from "react";

import {
    db, auth, doc, getDoc, setDoc, serverTimestamp,
    isSupported, getMessaging, getToken, app, functions, httpsCallable,
    onAuthStateChanged, User
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
    legalAcceptedAt?: string;
    adminApproved?: boolean;
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
const AUTH_BOOT_TIMEOUT_MS = 8000;
const AUTH_BOOT_HARD_DEADLINE_MS = 16000;
const PROFILE_OP_TIMEOUT_MS = 6000;

const withTimeout = <T,>(promise: Promise<T>, ms: number, label: string): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(() => reject(new Error(label)), ms);
        promise.then(
            (value) => {
                window.clearTimeout(timer);
                resolve(value);
            },
            (error) => {
                window.clearTimeout(timer);
                reject(error);
            },
        );
    });

const markGlobalAuthReady = () => {
    window.__BIN_GROUPS_BOOT__ = {
        ...(window.__BIN_GROUPS_BOOT__ || {}),
        authReady: true,
    };
};

const readVapidKey = () => {
    // @ts-ignore Vite runtime environment.
    return String(import.meta.env?.VITE_FIREBASE_VAPID_KEY || '').trim();
};

const pushPlatform = () => {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    const isStandalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone === true;
    return {
        value: isIOS ? (isStandalone ? 'ios-pwa' : 'ios-browser') : isAndroid ? 'android-web' : 'web',
        isStandalone,
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
    const profileSyncInFlightRef = useRef(0);
    const authObserverSettledRef = useRef(false);

    const enableNotifications = async (): Promise<boolean> => {
        if (!user?.uid) return false;
        try {
            if (!await isSupported() || !('serviceWorker' in navigator)) return false;
            const permission = await Notification.requestPermission();
            if (permission !== 'granted') return false;
            const key = readVapidKey();
            if (!key) return false;
            const device = pushPlatform();
            if (device.value === 'ios-browser') return false;
            const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js', { scope: '/' });
            const readyRegistration = await navigator.serviceWorker.ready;
            const currentToken = await getToken(getMessaging(app), {
                vapidKey: key,
                serviceWorkerRegistration: readyRegistration || registration,
            });
            if (!currentToken) return false;
            const registerToken = httpsCallable(functions, 'registerPushToken');
            const response = await registerToken({
                token: currentToken,
                platform: device.value,
                permission,
                isStandalone: device.isStandalone,
            });
            return (response.data as { enabled?: boolean }).enabled === true;
        } catch (err: unknown) {
            console.error("[AUTH] Notification enablement failed:", err);
            return false;
        }
    };

    const syncProfile = async (currentUser: User) => {
        profileSyncInFlightRef.current += 1;
        console.log("🔍 [AUTH_DIAG] syncProfile started for:", currentUser.uid);
        try {
            console.log("🔍 [AUTH_DIAG] Requesting ID Token Result (cached claims first)...");
            let tokenResult;
            try {
                tokenResult = await withTimeout(currentUser.getIdTokenResult(false), PROFILE_OP_TIMEOUT_MS, "Token Sync Timeout");
            } catch (err) {
                console.warn("[AUTH] Cached claims read failed or timed out. Trying one bounded forced refresh.", err);
                tokenResult = await withTimeout(currentUser.getIdTokenResult(true), PROFILE_OP_TIMEOUT_MS, "Forced token sync timeout");
            }
            const claims = tokenResult.claims;
            console.log("🔍 [AUTH_DIAG] Custom Claims Detected:", claims);

            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                console.log("🔍 [AUTH_DIAG] Fetching Firestore profile...");
                snap = await withTimeout(getDoc(userDocRef), PROFILE_OP_TIMEOUT_MS, "Own-profile read timeout");
            } catch (err: any) {
                console.error("📜 [ROLE-SYNC] Firestore read permission/error:", err);
                if (claims.role) {
                    setRole(String(claims.role));
                    setIsAdmin(!!claims.admin);
                    setLoading(false);
                    return;
                }
                setRole('tenant');
                setLoading(false);
                return;
            }

            if (snap && snap.exists()) {
                const data = snap.data();
                console.log("🔍 [AUTH_DIAG] Firestore Data Found:", data);

                setUser(prev => ({ ...currentUser, ...data } as any));

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
            profileSyncInFlightRef.current = Math.max(0, profileSyncInFlightRef.current - 1);
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

        const releaseBootFailClosed = () => {
            if (!loadingRef.current) return;
            const currentUser = auth.currentUser;
            console.warn("[AUTH_DIAG] Auth sync hard deadline. Releasing portal gate fail-closed.");
            if (currentUser) {
                setStatus('profile_unavailable');
                setError("PROFILE UNAVAILABLE: Secure account verification timed out. Retry before entering a portal.");
                setUser((existingUser) => existingUser || ({ ...currentUser, status: 'profile_unavailable' } as SovereignUser));
            }
            setLoading(false);
            markGlobalAuthReady();
        };

        const bootTimeoutId = window.setTimeout(() => {
            if (!loadingRef.current) return;
            if (profileSyncInFlightRef.current > 0 || auth.currentUser) {
                console.warn("[AUTH_DIAG] Auth sync still proving a persisted session. Holding the portal gate.");
                return;
            }
            if (!authObserverSettledRef.current) {
                console.warn("[AUTH_DIAG] Auth observer has not settled. Holding the portal gate.");
                return;
            }
            console.warn("[AUTH_DIAG] Auth sync timeout with no persisted session. Releasing blocker.");
            setLoading(false);
        }, AUTH_BOOT_TIMEOUT_MS);

        const hardDeadlineId = window.setTimeout(releaseBootFailClosed, AUTH_BOOT_HARD_DEADLINE_MS);

        const initAuth = async () => {
            console.log("🔍 [AUTH_DIAG] Initializing Sovereign Identity Bridge...");
            try {
                unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    authObserverSettledRef.current = true;
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
                    authObserverSettledRef.current = true;
                    console.error("❌ [AUTH_DIAG] Auth Observer Error:", err);
                    setError("PROTOCOL VIOLATION: " + err.message);
                    setLoading(false);
                });

            } catch (fatalErr: any) {
                console.error("❌ [AUTH-BOOT] Bridge Failure:", fatalErr);
                setError("IDENTITY FAULT: " + fatalErr.message);
                setLoading(false);
            }
        };

        initAuth();
        return () => {
            if (unsubscribe) unsubscribe();
            window.clearTimeout(bootTimeoutId);
            window.clearTimeout(hardDeadlineId);
        };
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
