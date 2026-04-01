import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth, doc, getDoc } from "../lib/firebase";

interface RoleContextType {
    role: string | null;
    status: string | null;
    isAdmin: boolean;
    loading: boolean;
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

    useEffect(() => {
        // [STABILITY] Tight 3-second safety catch
        const safetyTimeout = setTimeout(() => {
            if (loading) {
                console.warn("[ROLE] Global Stability Timeout (3s): Releasing UI.");
                setLoading(false);
            }
        }, 3000);

        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    // [SECURITY] Tight timeout for claim lookup
                    const tokenPromise = currentUser.getIdTokenResult(true);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("AUTH_TIMEOUT")), 2000));
                    
                    const tokenResult = await Promise.race([tokenPromise, timeoutPromise]) as any;
                    const claims = tokenResult.claims;
                    
                    if (claims.role) {
                        setRole(String(claims.role).toLowerCase());
                        setStatus(String(claims.status || 'active').toLowerCase());
                        setIsAdmin(claims.role === 'admin' || claims.isAdmin === true);
                    } else {
                        // FALLBACK TO FIRESTORE SECURED ROLE DATA
                        const snapPromise = getDoc(doc(db, "users", currentUser.uid));
                        const snap = await Promise.race([snapPromise, timeoutPromise]) as any;
                        
                        if (snap.exists()) {
                            const data = snap.data();
                            setRole(data.role?.toLowerCase() || 'owner');
                            setStatus(data.status?.toLowerCase() || 'pending');
                            setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                            setPropertyId(data.propertyId || null);
                        } else {
                            setRole('owner');
                            setStatus('pending');
                            setIsAdmin(false);
                            setPropertyId(null);
                        }
                    }
                } catch (err) {
                    console.error("Critical role/claim lookup failure:", err);
                    setRole('owner'); // Resilient fallback
                    setStatus('pending');
                } finally {
                    setLoading(false);
                    clearTimeout(safetyTimeout);
                }
            } else {
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setLoading(false);
                clearTimeout(safetyTimeout);
            }
        });

        return () => {
            unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, []);

    return (
        <RoleContext.Provider value={{ role, status, isAdmin, loading, user, propertyId }}>
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
