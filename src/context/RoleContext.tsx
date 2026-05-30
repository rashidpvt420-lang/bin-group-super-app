import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

import {
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp,
    onAuthStateChanged, arrayUnion
} from "../lib/firebase";
import type { User } from "../lib/firebase";
import { registerPushNotifications } from "../services/pushNotificationService";
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
    hasPermission: (permission: SovereignPermission) => boolean;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);
const AUTH_BOOT_TIMEOUT_MS = 8000;

const ADMIN_ROLES = new Set([
    'admin',
    'super_admin',
    'ceo',
    'manager',
    'operations_admin',
    'finance_admin',
    'hr_admin',
    'support_admin',
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager'
]);

const normalizeRole = (value: unknown): string => String(value || '').trim().toLowerCase();
const roleIsAdmin = (value: unknown): boolean => ADMIN_ROLES.has(normalizeRole(value));

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
    const [permissions, setPermissions] = useState<Record<string, boolean>>({});
    const loadingRef = useRef(loading);

    const enableNotifications = async (): Promise<boolean> => {
        const activeUser = auth.currentUser;
        if (!activeUser?.uid) return false;
        try {
            const result = await registerPushNotifications(activeUser.uid, role);
            return result.enabled === true;
        } catch (err) {
            console.warn("[AUTH] Push notification registration failed.", err);
            return false;
        }
    };

    const syncProfile = async (currentUser: User) => {
        console.log("[AUTH_DIAG] syncProfile started for:", currentUser.uid);
        try {
            const tokenPromise = currentUser.getIdTokenResult(true);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Token Sync Timeout")), 5000));

            const tokenResult: any = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
                console.warn("[AUTH] Token refresh failed or timed out. Proceeding with cached claims.", err);
                return currentUser.getIdTokenResult(false);
            });

            const claims = tokenResult.claims || {};
            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                snap = await getDoc(userDocRef);
            } catch (err: any) {
                console.error("[ROLE-SYNC] Firestore read permission/error:", err);
                if (claims.role) {
                    const claimRole = normalizeRole(claims.role);
                    const claimIsAdmin = Boolean(claims.admin || claims.isAdmin || roleIsAdmin(claimRole));
                    setRole(claimRole);
                    setIsAdmin(claimIsAdmin);
                    setStatus('active');
                    setUser({ ...currentUser, role: claimRole, isAdmin: claimIsAdmin, status: 'active' } as SovereignUser);
                    setError(null);
                    setLoading(false);
                    return;
                }
                setRole('tenant');
                setIsAdmin(false);
                setStatus('active');
                setLoading(false);
                return;
            }

            if (snap && snap.exists()) {
                const data = snap.data();

                let finalRole = normalizeRole(data.role || claims.role || 'tenant');
                let finalIsAdmin = Boolean(data.isAdmin || data.admin || roleIsAdmin(finalRole));

                try {
                    const grantEmailKey = (currentUser.email || '').toLowerCase().replace(/[.@]/g, '_');
                    const grantRef = doc(db, "pending_admin_grants", grantEmailKey);
                    const grantSnap = await getDoc(grantRef);

                    if (grantSnap.exists() && grantSnap.data().status === 'pending_first_login') {
                        finalRole = 'admin';
                        finalIsAdmin = true;

                        await updateDoc(userDocRef, {
                            role: 'admin',
                            isAdmin: true,
                            updatedAt: serverTimestamp(),
                            repairLogs: arrayUnion({ action: 'ADMIN_GRANT_APPLIED', timestamp: new Date().toISOString() })
                        });

                        await updateDoc(grantRef, {
                            status: 'consumed',
                            consumedAt: serverTimestamp(),
                            consumedByUid: currentUser.uid
                        });
                    }
                } catch (grantErr) {
                    console.warn("[REPAIR] Grant check bypassed:", grantErr);
                }

                let resolvedOnboardingComplete = data.onboardingComplete;
                const resolvedRole = normalizeRole(claims.role || finalRole || 'tenant');
                const resolvedStatus = normalizeRole(data.status || 'active');
                const resolvedIsAdmin = Boolean(claims.admin || claims.isAdmin || finalIsAdmin || roleIsAdmin(resolvedRole));

                if (resolvedRole !== 'owner' && !resolvedOnboardingComplete) {
                    resolvedOnboardingComplete = true;
                    updateDoc(userDocRef, { onboardingComplete: true }).catch(console.error);
                }

                setUser({
                    ...currentUser,
                    ...data,
                    role: resolvedRole,
                    isAdmin: resolvedIsAdmin,
                    onboardingComplete: resolvedOnboardingComplete
                } as SovereignUser);
                setRole(resolvedRole);
                setStatus(resolvedStatus);
                setIsAdmin(resolvedIsAdmin);
                setPermissions(data.permissions || {});
                setPropertyId(data.propertyId || data.unitId || null);
                setLegalAccepted(!!data.legalAcceptedAt);

                if (resolvedStatus === 'pending_approval') {
                    setError("ACCOUNT PENDING APPROVAL: Verification in progress.");
                } else {
                    setError(null);
                }
            } else {
                const resolvedRole = normalizeRole(claims.role || 'tenant') || 'tenant';
                const resolvedIsAdmin = Boolean(claims.admin || claims.isAdmin || roleIsAdmin(resolvedRole));
                const newProfile = {
                    uid: currentUser.uid,
                    email: (currentUser.email || '').toLowerCase(),
                    displayName: currentUser.displayName || "New User",
                    role: resolvedRole,
                    isAdmin: resolvedIsAdmin,
                    status: 'active',
                    createdAt: serverTimestamp()
                };

                await setDoc(userDocRef, newProfile, { merge: true });

                setUser({ ...currentUser, ...newProfile } as SovereignUser);
                setRole(resolvedRole);
                setIsAdmin(resolvedIsAdmin);
                setStatus('active');
                setPermissions({});
                setPropertyId(null);
                setLegalAccepted(true);
                setError(null);
                setLoading(false);
            }
        } catch (err: any) {
            console.error("[ROLE-SYNC] Fatal failure:", err);
            setError("IDENTITY SYNC FAULT: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const hasPermission = (permission: SovereignPermission): boolean => {
        if (isAdmin || roleIsAdmin(role)) return true;
        return !!permissions[permission];
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
        const timeoutId = window.setTimeout(() => {
            if (loadingRef.current) {
                console.warn("[AUTH_DIAG] Auth sync timeout. Releasing blocker.");
                setLoading(false);
            }
        }, AUTH_BOOT_TIMEOUT_MS);

        const initAuth = async () => {
            console.log("[AUTH_DIAG] Initializing Sovereign Identity Bridge...");
            try {
                unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
                    console.log("[AUTH_DIAG] Auth state changed. User:", currentUser?.email || 'NULL');
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
                    console.error("[AUTH_DIAG] Auth observer error:", err);
                    setError("PROTOCOL VIOLATION: " + err.message);
                    setLoading(false);
                    markGlobalAuthReady();
                });
            } catch (fatalErr: any) {
                console.error("[AUTH-BOOT] Bridge failure:", fatalErr);
                setError("IDENTITY FAULT: " + fatalErr.message);
                setLoading(false);
                markGlobalAuthReady();
            }
        };

        initAuth();
        return () => {
            if (unsubscribe) {
                unsubscribe();
            }
            window.clearTimeout(timeoutId);
        };
    }, []);

    return (
        <RoleContext.Provider value={{
            role, status, isAdmin, loading, error, user, propertyId, legalAccepted,
            enableNotifications, refreshRole, hasPermission
        }}>
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
