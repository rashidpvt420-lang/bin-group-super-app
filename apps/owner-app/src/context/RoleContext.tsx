import React, { createContext, useContext, useEffect, useState, ReactNode, useRef } from "react";
import { onAuthStateChanged, User, signOut } from "firebase/auth";
import { db, auth, doc, getDoc } from "../lib/firebase";

interface RoleContextType {
    role: string | null;
    status: string | null;
    isAdmin: boolean;
    loading: boolean;
    error: string | null;
    user: User | null;
    propertyId: string | null;
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
        }, 10000);

        console.log("💎 [BOOT] Sovereign RoleProvider Mounted. Watchdog Armed.");

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);

            if (currentUser) {
                try {
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("ROLE_SYNC_TIMEOUT")), 5000));
                    
                    const fetchRoles = async () => {
                        try {
                            const snap = await getDoc(doc(db, "users", currentUser.uid));
                            if (snap.exists()) {
                                const data = snap.data();
                                setRole(data.role?.toLowerCase() || null);
                                setStatus(data.status?.toLowerCase() || 'pending');
                                setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                                setPropertyId(data.propertyId || null);
                                setError(null);
                            } else {
                                setRole(null);
                                setStatus('pending');
                                setIsAdmin(false);
                            }
                        } catch (firestoreErr: any) {
                            console.error("[ROLE-SYNC] Firestore Fetch Error:", firestoreErr);
                            if (firestoreErr.code === 'permission-denied') {
                                setError("Access Denied: Missing or insufficient permissions.");
                                await signOut(auth);
                                setRole(null);
                                setUser(null);
                            } else {
                                throw firestoreErr;
                            }
                        }
                    };

                    await Promise.race([fetchRoles(), timeoutPromise]);
                } catch (err: any) {
                    console.error("[ROLE-SYNC] Critical resolution failure:", err);
                    const isPermissionError = err.code === 'permission-denied' || (err.message && err.message.includes('permission'));
                    if (isPermissionError) {
                         setError("Sovereign Integrity Breach: Identity verified but authorization was explicitly denied. Session cleared.");
                         await signOut(auth);
                         setRole(null);
                         setUser(null);
                    } else {
                        setError(err.message || "Authorization fault.");
                        setRole(null);
                    }
                } finally {
                    setLoading(false);
                    clearTimeout(safetyTimeout);
                }
            } else {
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setError(null);
                setLoading(false);
                clearTimeout(safetyTimeout);
            }
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
        <RoleContext.Provider value={{ role, status, isAdmin, loading, error, user, propertyId }}>
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
