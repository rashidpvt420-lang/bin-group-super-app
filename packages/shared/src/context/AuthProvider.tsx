import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";
import { 
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp, 
    isSupported, getMessaging, getToken, app, 
    onAuthStateChanged, arrayUnion, onSnapshot
} from "../lib/firebase";        
import type { User } from "../lib/firebase";
import { signOut } from "../lib/firebase";
import { LegalModal } from "../components/LegalModal";

export interface SovereignUser extends User {
    uid: string;
    email: string | null;
    displayName: string | null;
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
    permissions?: Record<string, boolean>;
}

export type SovereignPermission = 
    | 'canViewPayments'
    | 'canVerifyPayments'
    | 'canManageTenants'
    | 'canManageTechnicians'
    | 'canManageContracts'
    | 'canViewFinancials'
    | 'canEditPricing'
    | 'canManageCompanyProfile'
    | 'canDispatchJobs'
    | 'canViewAuditLogs'
    | 'canExportReports';

interface AuthContextType {
    isAuthenticated: boolean;
    role: string | null;
    status: string | null;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
    user: SovereignUser | null;
    propertyId: string | null;
    legalAccepted: boolean;
    enableNotifications: () => Promise<boolean>;
    refreshProfile: () => Promise<void>;
    hasPermission: (permission: SovereignPermission) => boolean;
    logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 12000;

const ADMIN_ROLES = new Set([
    'admin', 'super_admin', 'ceo', 'manager', 
    'operations_admin', 'finance_admin', 'hr_admin', 'support_admin'
]);

export function AuthProvider({ children, requireAdmin = false }: { children: any, requireAdmin?: boolean }) {
    const [role, setRole] = useState<string | null>(null);
    const [status, setStatus] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [user, setUser] = useState<SovereignUser | null>(null);
    const [propertyId, setPropertyId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [legalAccepted, setLegalAccepted] = useState(true);
    const [permissions, setPermissions] = useState<Record<string, boolean>>({});
    const loadingRef = useRef(loading);

    useEffect(() => {
        loadingRef.current = loading;
    }, [loading]);

    const syncProfile = async (currentUser: User) => {
        console.log("🔍 [SHARED-AUTH] syncProfile started for:", currentUser.uid);
        try {
            const tokenPromise = currentUser.getIdTokenResult(true);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_SYNC_TIMEOUT")), 10000));
            
            const tokenResult: any = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
                console.warn("🛡️ [SHARED-AUTH] Token refresh failed or timed out. Using cached claims.", err);
                return currentUser.getIdTokenResult(false);
            });
            
            const claims = tokenResult.claims || {};
            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                snap = await getDoc(userDocRef);
            } catch (err: any) {
                console.error("📜 [SHARED-AUTH] Firestore read fault:", err);
                if (claims.role) {
                    const claimRole = String(claims.role).toLowerCase();
                    const claimIsAdmin = !!(claims.admin || claims.isAdmin || ADMIN_ROLES.has(claimRole));
                    setRole(claimRole);
                    setIsAdmin(claimIsAdmin);
                    setLoading(false);
                    return;
                }
                throw new Error("IDENTITY_UNRESOLVABLE");
            }

            if (snap && snap.exists()) {
                const data = snap.data();
                
                // Emergency Admin Grant Check
                let finalRole = data.role;
                let finalIsAdmin = data.isAdmin || data.role === 'admin' || ADMIN_ROLES.has(String(data.role).toLowerCase());

                try {
                    const grantEmailKey = (currentUser.email || '').toLowerCase().replace(/[.@]/g, '_');
                    const grantSnap = await getDoc(doc(db, "pending_admin_grants", grantEmailKey));
                    if (grantSnap.exists() && grantSnap.data().status === 'pending_first_login') {
                        finalRole = 'admin';
                        finalIsAdmin = true;
                        await updateDoc(userDocRef, { role: 'admin', isAdmin: true, updatedAt: serverTimestamp() });
                        await updateDoc(grantSnap.ref, { status: 'consumed', consumedAt: serverTimestamp(), consumedByUid: currentUser.uid });
                    }
                } catch (e) {
                    console.warn("Admin grant check failed", e);
                }

                const resolvedRole = String(claims.role || finalRole || 'tenant').toLowerCase();
                const resolvedIsAdmin = !!(claims.admin || finalIsAdmin || ADMIN_ROLES.has(resolvedRole));
                
                if (requireAdmin && !resolvedIsAdmin) {
                    throw new Error("ADMIN_ACCESS_DENIED");
                }

                setUser({ ...currentUser, ...data, role: resolvedRole, isAdmin: resolvedIsAdmin } as any);
                setRole(resolvedRole);
                setStatus(data.status || 'active');
                setIsAdmin(resolvedIsAdmin);
                setPermissions(data.permissions || {});
                setPropertyId(data.propertyId || data.unitId || null);
                setLegalAccepted(!!data.legalAcceptedAt);
                setError(null);

            } else {
                // Initialize profile if missing
                const resolvedRole = String(claims.role || 'tenant').toLowerCase();
                const resolvedIsAdmin = !!(claims.admin || ADMIN_ROLES.has(resolvedRole));

                if (requireAdmin && !resolvedIsAdmin) {
                    throw new Error("ADMIN_ACCESS_DENIED");
                }

                const newProfile = {
                    uid: currentUser.uid,
                    email: (currentUser.email || '').toLowerCase(),
                    displayName: currentUser.displayName || "Sovereign User",
                    role: resolvedRole,
                    isAdmin: resolvedIsAdmin,
                    status: 'active',
                    createdAt: serverTimestamp()
                };
                await setDoc(userDocRef, newProfile);
                
                setUser({ ...currentUser, ...newProfile } as any);
                setRole(resolvedRole);
                setIsAdmin(resolvedIsAdmin);
                setStatus('active');
                setPermissions({});
                setLoading(false);
            }
        } catch (err: any) {
            console.error("📜 [SHARED-AUTH] Fatal failure:", err);
            if (err.message === "ADMIN_ACCESS_DENIED") {
                setError("This account does not have administrative privileges.");
                await signOut(auth);
            } else {
                setError("IDENTITY SYNC FAULT: " + err.message);
            }
        } finally {
            setLoading(false);
        }
    };

    const enableNotifications = async (): Promise<boolean> => {
        if (!user) return false;
        try {
            const supported = await isSupported();
            if (!supported) return false;
            const permission = await Notification.requestPermission();
            if (permission === 'granted') {
                const messaging = getMessaging(app);
                const token = await getToken(messaging, {
                    vapidKey: 'BAx9XuLUWYy4cmogu_fWTzC7xyCgLfa3asFfGC8PRrM6LqWCtDLihO72oISeOqTxgHtWlI6G4JJE4chfX5m5cOQ'
                });
                if (token) {
                    await updateDoc(doc(db, 'users', user.uid), {
                        fcmTokens: arrayUnion(token),
                        updatedAt: serverTimestamp()
                    });
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    };

    const hasPermission = (permission: SovereignPermission): boolean => {
        if (isAdmin) return true;
        return !!permissions[permission];
    };

    const refreshProfile = async () => {
        if (auth.currentUser) {
            setLoading(true);
            await syncProfile(auth.currentUser);
        }
    };

    const logout = async () => {
        setLoading(true);
        try {
            await signOut(auth);
            setUser(null);
            setRole(null);
            setIsAdmin(false);
            window.location.href = '/login';
        } catch (e) {
            window.location.reload();
        }
    };

    useEffect(() => {
        let userUnsub: any = null;

        const unsubscribe = onAuthStateChanged(auth, async (currentUser: User | null) => {
            if (currentUser) {
                await syncProfile(currentUser);

                // Subscribe to real-time user document changes (like onDuty, dutyStatus, permissions)
                userUnsub = onSnapshot(doc(db, "users", currentUser.uid), (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        setUser(prev => {
                            if (!prev) return prev;
                            return { ...prev, ...data } as any;
                        });
                        if (data.status) setStatus(data.status);
                        if (data.permissions) setPermissions(data.permissions);
                        if (data.propertyId || data.unitId) setPropertyId(data.propertyId || data.unitId);
                        if (data.legalAcceptedAt) setLegalAccepted(true);
                    }
                });
            } else {
                if (userUnsub) {
                    userUnsub();
                    userUnsub = null;
                }
                setUser(null);
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setLegalAccepted(true);
                setError(null);
                setLoading(false);
            }
            if (typeof window !== 'undefined') {
                (window as any).__BIN_GROUPS_BOOT__ = { ...((window as any).__BIN_GROUPS_BOOT__ || {}), authReady: true };
            }
        });

        const timeout = setTimeout(() => {
            if (loadingRef.current) setLoading(false);
        }, AUTH_BOOT_TIMEOUT_MS);

        return () => {
            unsubscribe();
            if (userUnsub) userUnsub();
            clearTimeout(timeout);
        };
    }, []);

    const value = {
        isAuthenticated: !!user,
        role,
        status,
        isAdmin,
        loading,
        error,
        user,
        propertyId,
        legalAccepted,
        enableNotifications,
        refreshProfile,
        hasPermission,
        logout
    };

    return (
        <AuthContext.Provider value={value}>
            {user && !legalAccepted && !loading && !error && (
                <LegalModal userId={user.uid} onAccepted={() => setLegalAccepted(true)} />
            )}
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth() {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
}

export const useRole = useAuth;
