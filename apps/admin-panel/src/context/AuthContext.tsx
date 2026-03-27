import React, { createContext, useContext, useState, useEffect } from 'react';

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
        import('../lib/firebase').then(({ auth }) => {
            import('firebase/auth').then(({ onAuthStateChanged }) => {
                const unsubscribe = onAuthStateChanged(auth, async (usr) => {
                    if (usr) {
                        try {
                            const { getDoc, doc } = await import('firebase/firestore');
                            const { db } = await import('../lib/firebase');
                            const userDoc = await getDoc(doc(db, 'users', usr.uid));
                            if (userDoc.exists()) {
                                setUser({ ...usr, ...userDoc.data() });
                            } else {
                                setUser(usr);
                            }
                            setIsAuthenticated(true);
                        } catch (error) {
                            console.error('Error fetching user metadata:', error);
                            setUser(usr);
                            setIsAuthenticated(true);
                        }
                    } else {
                        setIsAuthenticated(false);
                        setUser(null);
                    }
                    setLoading(false);
                });
                return () => unsubscribe();
            });
        });
    }, []);

    const login = async (credentials: any) => {
        // Will be handled natively in Login.tsx
    };

    const logout = () => {
        import('../lib/firebase').then(({ auth }) => {
            import('firebase/auth').then(({ signOut }) => {
                signOut(auth).then(() => {
                    setIsAuthenticated(false);
                    setUser(null);
                });
            });
        });
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
