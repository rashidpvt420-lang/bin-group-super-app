import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

import {
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp,
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
    'hr_manager',
    'hr_staff',
    'finance_staff',
    'account_manager',
    'dispatcher',
    'operations_manager'
]);

const BREAK_GLASS_ADMIN_EMAILS = new Set([
    'ceo@bin-groups.com',
    'ceo@bin-group.com',
]);

const normalizeRole = (value: unknown): string => String(value || '').trim().toLowerCase();
const canonicalEmail = (value: unknown): string => {
    const email = String(value || '').trim().toLowerCase();
    const [local, domain] = email.split('@');
    if (!local || !domain) return email;
    const normalizedDomain = domain === 'googlemail.com' ? 'gmail.com' : domain;
    const normalizedLocal = normalizedDomain === 'gmail.com' ? local.split('+')[0].replace(/\./g, '') : local;
    return `${normalizedLocal}@${normalizedDomain}`;
};
const founderEmailGrantsAdmin = (value: unknown): boolean => BREAK_GLASS_ADMIN_EMAILS.has(canonicalEmail(value));
const roleIsAdmin = (value: unknown): boolean => ADMIN_ROLES.has(normalizeRole(value));
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
        const founderBootstrap = founderEmailGrantsAdmin(currentUser.email);
        try {
            const tokenPromise = currentUser.getIdTokenResult(true);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Token Sync Timeout")), 5000));

            const tokenResult: any = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
                console.warn("[AUTH] Token refresh failed or timed out. Proceeding with cached claims.", err);
                return currentUser.getIdTokenResult(false);
            });

            const claims = tokenResult.claims || {};
            const claimRole = claimRoleFrom(claims);
            const claimIsAdmin = claimsGrantAdmin(claims) || founderBootstrap;
            const userDocRef = doc(db, "users", currentUser.uid);
            let snap;

            try {
                snap = await getDoc(userDocRef);
            } catch (err: any) {
                console.error("[ROLE-SYNC] Firestore read permission/error:", err);
                if (founderBootstrap || roleIsValid(claimRole)) {
                    const recoveredRole = founderBootstrap ? 'super_admin' : claimRole;
                    const recoveredIsAdmin = founderBootstrap || claimIsAdmin;
                    setRole(recoveredRole);
                    setIsAdmin(recoveredIsAdmin);
                    setStatus('active');
                    setUser({ ...currentUser, role: recoveredRole, isAdmin: recoveredIsAdmin, status: 'active', bootstrapAdmin: founderBootstrap } as SovereignUser);
                    setError(null);
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

            if (snap && snap.exists()) {
                const data = snap.data();
                const firestoreRole = normalizeRole(data.role);
                const finalRole = founderBootstrap ? 'super_admin' : (roleIsValid(claimRole) ? claimRole : firestoreRole);
                const finalIsAdmin = founderBootstrap || claimIsAdmin || (roleIsAdmin(finalRole) && (data.isAdmin === true || data.adminApproved === true || data.admin === true));

                try {
                    const grantEmailKey = (currentUser.email || '').toLowerCase().replace(/[.@]/g, '_');
                    const grantRef = doc(db, "pending_admin_grants", grantEmailKey);
                    const grantSnap = await getDoc(grantRef);

                    if (grantSnap.exists() && grantSnap.data().status === 'pending_first_login' && !finalIsAdmin) {
                        console.warn("[AUTH] Pending admin grant exists, but no verified admin profile or immutable admin custom claim is present. Admin access withheld.");
                    }
                } catch (grantErr) {
                    console.warn("[REPAIR] Grant check bypassed:", grantErr);
                }

                if (!roleIsValid(finalRole)) {
                    await updateDoc(userDocRef, {
                        status: 'role_required',
                        roleMissingDetectedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }).catch(console.warn);

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

                let resolvedOnboardingComplete = data.onboardingComplete;
                const resolvedRole = finalRole;
                const resolvedStatus = founderBootstrap ? 'active' : normalizeRole(data.status || 'active');
                const resolvedIsAdmin = finalIsAdmin;

                if (founderBootstrap && (data.role !== 'super_admin' || data.isAdmin !== true || data.admin !== true)) {
                    updateDoc(userDocRef, {
                        role: 'super_admin',
                        userRole: 'super_admin',
                        primaryRole: 'super_admin',
                        isAdmin: true,
                        admin: true,
                        ceo: true,
                        adminApproved: true,
                        onboardingComplete: true,
                        status: 'ACTIVE',
                        founderBootstrapRepairedAt: serverTimestamp(),
                        updatedAt: serverTimestamp(),
                    }).catch((repairErr) => console.warn('[AUTH] Founder admin profile repair deferred:', repairErr));
                    resolvedOnboardingComplete = true;
                }

                if (resolvedRole !== 'owner' && !resolvedOnboardingComplete) {
                    resolvedOnboardingComplete = true;
                    updateDoc(userDocRef, { onboardingComplete: true }).catch(console.error);
                }

                setUser({
                    ...currentUser,
                    ...data,
                    role: resolvedRole,
                    isAdmin: resolvedIsAdmin,
                    onboardingComplete: resolvedOnboardingComplete,
                    bootstrapAdmin: founderBootstrap
                } as SovereignUser);
                setRole(resolvedRole);
                setStatus(resolvedStatus);
                setIsAdmin(resolvedIsAdmin);
                setPermissions(resolvedIsAdmin ? (data.permissions || {}) : {});
                setPropertyId(data.propertyId || data.unitId || null);
                setLegalAccepted(founderBootstrap ? true : !!data.legalAcceptedAt);

                if (resolvedStatus === 'pending_approval' && !founderBootstrap) {
                    setError("ACCOUNT PENDING APPROVAL: Verification in progress.");
                } else {
                    setError(null);
                }
            } else {
                const hasValidRole = roleIsValid(claimRole);
                const resolvedRole = founderBootstrap ? 'super_admin' : claimRole;
                const newProfile = {
                    uid: currentUser.uid,
                    email: (currentUser.email || '').toLowerCase(),
                    displayName: currentUser.displayName || (founderBootstrap ? 'Rashid Abdul Ghani' : "New User"),
                    ...(founderBootstrap
                        ? { role: 'super_admin', userRole: 'super_admin', primaryRole: 'super_admin', isAdmin: true, admin: true, ceo: true, adminApproved: true, onboardingComplete: true, status: 'ACTIVE' }
                        : hasValidRole
                            ? { role: resolvedRole, isAdmin: claimIsAdmin, status: 'active' }
                            : { status: 'role_required' }),
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                };

                await setDoc(userDocRef, newProfile, { merge: true });

                setUser({ ...currentUser, ...newProfile, bootstrapAdmin: founderBootstrap } as SovereignUser);
                setRole(founderBootstrap || hasValidRole ? resolvedRole : null);
                setIsAdmin(founderBootstrap || (hasValidRole ? claimIsAdmin : false));
                setStatus(founderBootstrap || hasValidRole ? 'active' : 'role_required');
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