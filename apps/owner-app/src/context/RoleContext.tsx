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
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            // [CRITICAL] Block rendering until identity and role are 100% resolved
            setLoading(true); 
            setUser(currentUser);

            if (currentUser) {
                try {
                    // 1. First check Custom Claims (Fastest)
                    const tokenResult = await currentUser.getIdTokenResult(true);
                    const claims = tokenResult.claims;
                    
                    if (claims.role) {
                        setRole(String(claims.role).toLowerCase());
                        setStatus(String(claims.status || 'active').toLowerCase());
                        setIsAdmin(claims.role === 'admin' || claims.isAdmin === true);
                        setLoading(false);
                    } else {
                        // 2. Fallback to Firestore (Authoritative for non-claim roles)
                        const snap = await getDoc(doc(db, "users", currentUser.uid));
                        
                        if (snap.exists()) {
                            const data = snap.data();
                            setRole(data.role?.toLowerCase() || null);
                            setStatus(data.status?.toLowerCase() || 'pending');
                            setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                            setPropertyId(data.propertyId || null);
                        } else {
                            // User exists in Auth but has no Firestore profile yet
                            setRole(null);
                            setStatus('pending');
                            setIsAdmin(false);
                        }
                        setLoading(false);
                    }
                } catch (err) {
                    console.error("[ROLE-SYNC] Critical resolution failure:", err);
                    setRole(null);
                    setLoading(false);
                }
            } else {
                // No user authenticated
                setRole(null);
                setStatus(null);
                setIsAdmin(false);
                setPropertyId(null);
                setLoading(false);
            }
        });

        return () => unsubscribe();
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
