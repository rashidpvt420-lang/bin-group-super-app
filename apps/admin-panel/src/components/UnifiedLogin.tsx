import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { 
    GoogleAuthProvider, 
    signInWithPopup, 
    UserCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc, query, collection, where, getDocs, deleteDoc, serverTimestamp } from 'firebase/firestore';

export default function UnifiedLogin() {
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleAuthSuccess = async (userCredential: UserCredential) => {
        const user = userCredential.user;
        const uid = user.uid;
        const email = user.email?.toLowerCase();
        
        try {
            // [STRICT-AUTH] UID-First Architecture Validation
            const docRef = doc(db, 'users', uid);
            let docSnap = await getDoc(docRef);

            // 1. Migration Logic: If doc(uid) missing, check for pre-provisioned email match
            if (!docSnap.exists() && email) {
                console.info("🔍 [IAM] UID profile missing. Checking for legacy/pre-provisioned email match...");
                const q = query(collection(db, 'users'), where('email', '==', email));
                const querySnap = await getDocs(q);

                if (!querySnap.empty) {
                    const legacyDoc = querySnap.docs[0];
                    if (legacyDoc.id !== uid) {
                        console.info("⚡ [IAM] Migration Triggered: Moving legacy profile", legacyDoc.id, "to proper UID", uid);
                        const legacyData = legacyDoc.data();
                        
                        // Atomic Migration
                        await setDoc(docRef, {
                            ...legacyData,
                            uid: uid,
                            migratedFrom: legacyDoc.id,
                            updatedAt: serverTimestamp()
                        }, { merge: true });

                        await deleteDoc(legacyDoc.ref);
                        console.info("✅ [IAM] Migration Complete. Legacy document purged.");
                        docSnap = await getDoc(docRef); // Refresh local snap
                    }
                }
            }

            // 2. Role Verification
            const tokenResult = await user.getIdTokenResult(true);
            const claims = tokenResult.claims;
            
            let hasAccess = false;

            if (claims.role === 'admin' || claims.isAdmin === true) {
                hasAccess = true;
            } else if (docSnap.exists()) {
                const data = docSnap.data();
                const role = data.role?.toUpperCase();
                const isAdmin = data.isAdmin === true;
                if (role === 'ADMIN' || isAdmin) {
                    hasAccess = true;
                }
            }

            if (hasAccess) {
                console.info("🔒 [ADMIN-AUTH] Access Granted for:", email);
                window.location.href = '/admin/dashboard';
            } else {
                console.warn("🚫 [ADMIN-AUTH] Access Denied for:", email);
                setError('ACCESS DENIED: Administrative privileges required.');
                setLoading(false);
                await auth.signOut();
            }
        } catch (err: any) {
            console.error("🚨 Security Clearance Protocol Failed:", err);
            setError("Security clearance failed. Please try again.");
            setLoading(false);
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        try {
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ 
                prompt: 'select_account'
            });
            const result = await signInWithPopup(auth, provider);
            await handleAuthSuccess(result);
        } catch (err: any) {
            console.error("🚨 [ADMIN-AUTH] Initiation Failure:", err);
            setError(err.message || 'Failed to initiate secure login.');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#0f172a] rounded-[32px] overflow-hidden border border-emerald-500/10 shadow-[0_40px_100px_-15px_rgba(0,0,0,0.8)] relative">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-emerald-500/50 to-transparent" />
                
                <div className="p-10">
                    <div className="text-center mb-10">
                        <div className="inline-block p-4 rounded-2xl bg-emerald-500/5 border border-emerald-500/10 mb-6">
                            <h2 className="text-3xl font-black text-white uppercase tracking-tighter leading-none">BIN GROUP</h2>
                            <p className="text-emerald-500 text-[10px] font-black uppercase tracking-[0.4em] mt-2">Administry OS</p>
                        </div>
                        <p className="text-[#94a3b8] text-sm font-bold">SECURE COMMAND GATEWAY</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-[#ef4444] text-[11px] font-black uppercase tracking-wider p-4 rounded-xl mb-8 text-center animate-pulse">
                            {error}
                        </div>
                    )}

                    <div className="flex flex-col gap-6">
                        <button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            className="w-full bg-white text-slate-950 font-black text-sm p-5 rounded-2xl uppercase tracking-widest transition-all hover:bg-emerald-50 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-[0_10px_20px_rgba(255,255,255,0.05)]"
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <svg className="animate-spin h-5 w-5 text-slate-950" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                    Verifying...
                                </span>
                            ) : (
                                <>
                                    <svg className="w-5 h-5" viewBox="0 0 24 24">
                                        <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                        <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                        <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                        <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                                    </svg>
                                    Sign in with Google
                                </>
                            )}
                        </button>
                        
                        <p className="text-[10px] text-[#475569] font-bold text-center px-4 leading-relaxed">
                            UNAUTHORIZED ACCESS TO THIS SOVEREIGN INTERFACE IS PROHIBITED AND SUBJECT TO INSTITUTIONAL AUDIT.
                        </p>
                    </div>
                </div>
            </div>
            
            <div className="mt-8 text-center opacity-40">
                <p className="text-[9px] text-[#94a3b8] font-black uppercase tracking-[0.3em]">
                    BIN GROUP SOVEREIGN CORE v1.21
                </p>
            </div>
        </div>
    );
}
