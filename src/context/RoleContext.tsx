import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

import {
    db, auth, doc, getDoc, setDoc, serverTimestamp,
    onAuthStateChanged
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
    | 'canManageProperties'
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
const VALID_PORTAL_ROLES = new Set(['owner', 'tenant', 'technician', 'broker', 'admin', 'super_admin', 'ceo', 'manager', 'operations_admin', 'finance_admin', 'hr_admin', 'support_admin', 'hr_manager', 'hr_staff', 'finance_staff', 'account_manager', 'dispatcher', 'operations_manager', 'auditor']);

const ADMIN_ROLES = new Set([
    'admin',
    'super_admin',
    'ceo',
    'manager',
    'operations_admin',
    'finance_admin',
    'hr_admin',
    'support_admin',
]);

// Staff-tier roles get into /admin/* (read-only) but must never be granted
// blanket isAdmin trust — mirrors apps/admin-panel's AuthContext.tsx STAFF_ROLES
// split so the same role carries the same trust level in both apps.
const STAFF_ROLES = new Set([
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager',
]);

const normalizeRole = (value: unknown): string => String(value || '').trim().toLowerCase();
const roleIsAdmin = (value: unknown): boolean => ADMIN_ROLES.has(normalizeRole(value));
const roleIsStaff = (value: unknown): boolean => STAFF_ROLES.has(normalizeRole(value));
const roleIsValid = (value: unknown): boolean => VALID_PORTAL_ROLES.has(normalizeRole(value));

const claimRoleFrom = (claims: Record<string, unknown>): string => normalizeRole(claims.role || claims.userRole || claims.primaryRole);
const claimsGrantAdmin = (claims: Record<string, unknown>): boolean => {
    const claimRole = claimRoleFrom(claims);
    return Boolean(
        claims.admin === true ||
        claims.isAdmin === true ||
        claims.ceo === true ||
        claims.manager === true ||
        roleIsAdmin(claimRole)
    );
};

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
            const claimRole = claimRoleFrom(claims);
            const claimIsAdmin = claimsGrantAdmin(claims);
            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                snap = await getDoc(userDocRef);
            } catch (firstErr: any) {
                console.warn("[ROLE-SYNC] Firestore read failed, retrying once:", firstErr);
                await new Promise((resolve) => setTimeout(resolve, 600));
                try {
                    snap = await getDoc(userDocRef);
                } catch (err: any) {
                    console.error("[ROLE-SYNC] Firestore read permission/error after retry:", err);
                    if (roleIsValid(claimRole)) {
                        const recoveredRole = claimRole;
                        const recoveredIsAdmin = claimIsAdmin;
                        setRole(recoveredRole);
                        setIsAdmin(recoveredIsAdmin);
                        setStatus('profile_unavailable');
                        setUser({ ...currentUser, role: recoveredRole, isAdmin: recoveredIsAdmin, status: 'profile_unavailable' } as SovereignUser);
                        setError("PROFILE UNAVAILABLE: Account status could not be verified. Retry before entering a portal.");
                        setLoading(false);
                        return;
                    }
                    setRole(null);
                    setIsAdmin(false);
                    setStatus('role_required');
                    setUser({ ...currentUser, status: 'role_required' } as SovereignUser);
                    setError(null);
                    setLoading(false);
                    return;
                }
            }

            if (snap && snap.exists()) {
                const data = snap.data();
                const finalRole = roleIsValid(claimRole) ? claimRole : '';
                const finalIsAdmin = claimIsAdmin;

                if (!roleIsValid(finalRole)) {
                    setUser({
                        ...currentUser,
                        ...data,
                        status: 'role_required',
                        isAdmin: false,
                    } as SovereignUser);
                    setRole(null);
                    setStatus('role_required');
                    setIsAdmin(false);
                    setPermissions({});
                    setPropertyId(null);
                    setLegalAccepted(true);
                    setError(null);
                    setLoading(false);
                    return;
                }

                const resolvedOnboardingComplete = data.onboardingComplete;
                const resolvedRole = finalRole;
                // A claim identifies the portal, but it does not prove that the
                // corresponding profile was approved. Missing status must stay
                // locked until the server writes an explicit lifecycle state.
                const resolvedStatus = data.status
                    ? normalizeRole(data.status)
                    : 'profile_incomplete';
                const resolvedIsAdmin = finalIsAdmin;

                setUser({
                    ...currentUser,
                    ...data,
                    role: resolvedRole,
                    status: resolvedStatus,
                    isAdmin: resolvedIsAdmin,
                    onboardingComplete: resolvedOnboardingComplete,
                } as SovereignUser);
                setRole(resolvedRole);
                setStatus(resolvedStatus);
                setIsAdmin(resolvedIsAdmin);
                setPermissions((resolvedIsAdmin || roleIsStaff(resolvedRole)) ? (data.permissions || {}) : {});
                setPropertyId(data.propertyId || data.unitId || null);
                setLegalAccepted(!!data.legalAcceptedAt);

                if (resolvedStatus === 'pending_approval') {
                    setError("ACCOUNT PENDING APPROVAL: Verification in progress.");
                } else {
                    setError(null);
                }
            } else {
                const hasValidRole = roleIsValid(claimRole);
                const resolvedRole = claimRole;
                if (hasValidRole) {
                    setUser({
                        ...currentUser,
                        role: resolvedRole,
                        isAdmin: claimIsAdmin,
                        status: 'profile_missing',
                    } as SovereignUser);
                    setRole(resolvedRole);
                    setIsAdmin(claimIsAdmin);
                    setStatus('profile_missing');
                    setPermissions({});
                    setPropertyId(null);
                    setLegalAccepted(true);
                    setError("PROFILE MISSING: A server-provisioned account profile is required.");
                    setLoading(false);
                    return;
                }

                const newProfile = {
                    uid: currentUser.uid,
                    email: (currentUser.email || '').toLowerCase(),
                    displayName: currentUser.displayName || "New User",
                    status: 'role_required',
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };

                await setDoc(userDocRef, newProfile, { merge: true });

                setUser({ ...currentUser, ...newProfile } as SovereignUser);
                setRole(null);
                setIsAdmin(false);
                setStatus('role_required');
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
        if (isAdmin) return true;
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
            {user && !legalAccepted && !loading && !error && status !== 'role_required' && (
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
