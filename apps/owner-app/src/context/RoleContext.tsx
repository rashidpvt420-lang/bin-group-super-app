import React, { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { db, auth, doc, getDoc } from "../lib/firebase";

interface RoleContextType {
    role: string | null;
    isAdmin: boolean;
    godMode: boolean;
    loading: boolean;
    user: User | null;
}

const RoleContext = createContext<RoleContextType | undefined>(undefined);

export function RoleProvider({ children }: { children: ReactNode }) {
    const [role, setRole] = useState<string | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [godMode, setGodMode] = useState(false);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            setUser(currentUser);
            if (currentUser) {
                try {
                    // [SECURITY] Fetch ID token result to check for custom claims
                    const tokenResult = await currentUser.getIdTokenResult(true);
                    const claims = tokenResult.claims;
                    
                    if (claims.role) {
                        setRole(String(claims.role).toLowerCase());
                        setIsAdmin(claims.role === 'admin' || claims.isAdmin === true);
                        setGodMode(claims.godMode === true);
                    } else {
                        // FALLBACK TO FIRESTORE + HARDCODED (PILOT PHASE)
                        const email = currentUser.email?.toLowerCase();
                        if (email === 'rashidpvt420@gmail.com') {
                            setRole('admin');
                            setIsAdmin(true);
                            setGodMode(true);
                        } else {
                            const snap = await getDoc(doc(db, "users", currentUser.uid));
                            if (snap.exists()) {
                                const data = snap.data();
                                setRole(data.role?.toLowerCase() || 'owner');
                                setIsAdmin(data.role?.toLowerCase() === 'admin' || data.isAdmin === true);
                                setGodMode(data.godMode === true);
                            } else {
                                setRole('owner');
                                setIsAdmin(false);
                                setGodMode(false);
                            }
                        }
                    }
                } catch (err) {
                    console.error("Critical role/claim lookup failure:", err);
                    setRole('owner');
                }
            } else {
                setRole(null);
                setIsAdmin(false);
                setGodMode(false);
            }
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return (
        <RoleContext.Provider value={{ role, isAdmin, godMode, loading, user }}>
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
