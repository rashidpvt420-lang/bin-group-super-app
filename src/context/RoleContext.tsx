import React, { createContext, useContext, useEffect, useState, useRef, type ReactNode } from "react";

// Production Imports
import { 
    db, auth, doc, getDoc, setDoc, updateDoc, serverTimestamp, 
    isSupported, getMessaging, getToken, app, 
    onAuthStateChanged, arrayUnion
} from "../lib/firebase";        
import type { User } from "../lib/firebase";
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
const AUTH_BOOT_TIMEOUT_MS = 8000; // Increased for live sync robustness

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
        console.warn("🛡️ [AUTH] Push notifications temporarily disabled during caching repair.");
        return false;
    };

    const syncProfile = async (currentUser: User) => {
        console.log("🔍 [AUTH_DIAG] syncProfile started for:", currentUser.uid);
        try {
            // 1. Force Token Refresh to pick up new Custom Claims
            console.log("🔍 [AUTH_DIAG] Requesting ID Token Result (Force Refresh)...");
            
            // Timeout to prevent infinite hang on local/network failure
            const tokenPromise = currentUser.getIdTokenResult(true);
            const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("Token Sync Timeout")), 5000));
            
            const tokenResult: any = await Promise.race([tokenPromise, timeoutPromise]).catch(err => {
                console.warn("🛡️ [AUTH] Token refresh failed or timed out. Proceeding with existing claims.", err);
                return currentUser.getIdTokenResult(false); // Fallback to cached
            });
            
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
                
                // [Role System Repair] Check for emergency admin grants
                let finalRole = data.role;
                let finalIsAdmin = data.isAdmin || data.role === 'admin';

                try {
                    const grantEmailKey = (currentUser.email || '').toLowerCase().replace(/[.@]/g, '_');
                    const grantRef = doc(db, "pending_admin_grants", grantEmailKey);
                    const grantSnap = await getDoc(grantRef);
                    
                    if (grantSnap.exists() && grantSnap.data().status === 'pending_first_login') {
                        console.log("🛠️ [REPAIR] Emergency Admin Grant Detected for:", currentUser.email);
                        finalRole = 'admin';
                        finalIsAdmin = true;
                        
                        // Apply to permanent profile
                        await updateDoc(userDocRef, {
                            role: 'admin',
                            isAdmin: true,
                            updatedAt: serverTimestamp(),
                            repairLogs: arrayUnion({ action: 'ADMIN_GRANT_APPLIED', timestamp: new Date().toISOString() })
                        });
                        
                        // Mark grant as consumed
                        await updateDoc(grantRef, {
                            status: 'consumed',
                            consumedAt: serverTimestamp(),
                            consumedByUid: currentUser.uid
                        });
                        console.log("🛠️ [REPAIR] Admin privileges secured and grant record consumed.");
                    }
                } catch (grantErr) {
                    console.warn("🛡️ [REPAIR] Grant check bypassed:", grantErr);
                }

                let resolvedOnboardingComplete = data.onboardingComplete;

                // 2. Resolve Role (Priority: Claims > Firestore > Default)
                const resolvedRole = String(claims.role || finalRole || 'tenant').toLowerCase();
                const resolvedStatus = (data.status || 'active').toLowerCase();
                const resolvedIsAdmin = !!(claims.admin || finalIsAdmin);

                // Auto-fix non-owners to have onboardingComplete: true
                if (resolvedRole !== 'owner' && !resolvedOnboardingComplete) {
                     resolvedOnboardingComplete = true;
                     // Auto-heal firestore in background
                     updateDoc(userDocRef, { onboardingComplete: true }).catch(console.error);
                }

                setUser({ ...currentUser, ...data, role: finalRole, isAdmin: finalIsAdmin, onboardingComplete: resolvedOnboardingComplete } as any);

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
                setPermissions({});
                setLoading(false);
            }
        } catch (err: any) {
            console.error("📜 [ROLE-SYNC] Fatal failure:", err);
            setError("IDENTITY SYNC FAULT: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const hasPermission = (permission: SovereignPermission): boolean => {
        if (isAdmin || role === 'ceo' || role === 'admin') return true;
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
