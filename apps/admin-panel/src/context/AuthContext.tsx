import React, { createContext, useContext, useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getDoc, setDoc, doc } from 'firebase/firestore';

interface AuthContextType {
    isAuthenticated: boolean;
    loading: boolean;
    user: any;
    login: (credentials: any) => Promise<void>;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [loading, setLoading] = useState(true);
    const [user, setUser] = useState<any | null>(null);

    useEffect(() => {
        // [STABILITY] Tight 3-second safety catch
        const safetyTimeout = setTimeout(() => {
            if (loading) {
                console.warn("[AUTH] Admin Panel Stability Catch (3s): Forcing loading=false");
                setLoading(false);
            }
        }, 3000);

        const unsubscribe = onAuthStateChanged(auth, async (usr) => {
            if (usr) {
                try {
                    // Force refresh claims with a tight 2s timeout
                    const refreshPromise = usr.getIdTokenResult(true);
                    const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error("REFRESH_TIMEOUT")), 2000));
                    
                    await Promise.race([refreshPromise, timeoutPromise]);
                    
                    const userDocPromise = getDoc(doc(db, 'users', usr.uid));
                    const userDoc = await Promise.race([userDocPromise, timeoutPromise]) as any;

                    if (userDoc.exists()) {
                        const data = userDoc.data();
                        if (data.role === 'admin' || data.isAdmin === true) {
                            setUser({ ...usr, ...data });
                            setIsAuthenticated(true);
                        } else {
                            console.warn("[AUTH] Denying access: Not an admin", usr.email);
                            await auth.signOut();
                            setIsAuthenticated(false);
                            setUser(null);
                        }
                    } else {
                        // STRICT: No profile means no access
                        console.warn("[AUTH] Denying access: No profile found for", usr.email);
                        await auth.signOut();
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                } catch (error) {
                    console.error('Error fetching user metadata:', error);
                    setUser(usr); // Resilient fallback to Auth user
                    setIsAuthenticated(true);
                } finally {
                    setLoading(false);
                    clearTimeout(safetyTimeout);
                }
            } else {
                setIsAuthenticated(false);
                setUser(null);
                setLoading(false);
                clearTimeout(safetyTimeout);
            }
        });

        return () => {
            unsubscribe();
            clearTimeout(safetyTimeout);
        };
    }, [loading]);

    const login = async (credentials: any) => {
        // Handled in Login component
    };

    const logout = async () => {
        await auth.signOut();
        setIsAuthenticated(false);
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ isAuthenticated, loading, user, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
};

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error('useAuth must be used within AuthProvider');
    return context;
};
