import React, { useState, useEffect } from 'react';
import { auth, db } from '../lib/firebase';
import { 
    signInWithEmailAndPassword, 
    GoogleAuthProvider, 
    signInWithRedirect, 
    getRedirectResult,
    UserCredential
} from 'firebase/auth';
import { doc, getDoc, setDoc } from 'firebase/firestore';

export default function UnifiedLogin() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        // [SOVEREIGN-AUDIT] Handle Secure Authorization Code Flow Result
        const handleRedirect = async () => {
            try {
                // Ensure auth instance is initialized via standard getAuth protocol
                const result = await getRedirectResult(auth);
                if (result) {
                    console.info("🔒 [SSO-GATEWAY] Secure handshake verified. Finalizing credential chain...");
                    await handleAuthSuccess(result);
                }
            } catch (err: any) {
                console.error("🚨 [SSO-GATEWAY] Redirect Handshake Failed:", err);
                setError(`SSO Handshake Rejection: ${err.message || 'Verification Error'}`);
            }
        };
        handleRedirect();
    }, []);

    const handleAuthSuccess = async (userCredential: UserCredential) => {
        const user = userCredential.user;
        const uid = user.uid;
        
        // CEO/ADMIN Bypass for Sovereign Verification (Institutional Gold List)
        const goldList = ['rashidpvt420@gmail.com', 'rashid.pvt420@gmail.com', 'rashidbinabdulghani@gmail.com'];
        if (user.email && goldList.includes(user.email.toLowerCase())) {
            await setDoc(doc(db, 'users', uid), {
                email: user.email.toLowerCase(),
                role: 'ADMIN',
                isAdmin: true,
                godMode: true,
                updatedAt: new Date().toISOString()
            }, { merge: true });
            
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            window.location.href = isLocal ? 'http://localhost:3000/' : '/admin/';
            return;
        }

        const docRef = doc(db, 'users', uid);
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const role = docSnap.data().role;
            const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            
            console.info(`🔒 [SSO-GATEWAY] Routing verified identity (Role: ${role})`);

            switch (role) {
                case 'TENANT':
                    window.location.href = isLocal ? 'http://localhost:5173/' : 'https://bin-group-57c60-tenant.web.app/';
                    break;
                case 'TECHNICIAN':
                    window.location.href = isLocal ? 'http://localhost:5174/' : 'https://bin-group-57c60-tech.web.app/';
                    break;
                case 'OWNER':
                    window.location.href = isLocal ? 'http://localhost:5175/' : 'https://bin-group-57c60.web.app/dashboard';
                    break;
                case 'ADMIN':
                    window.location.href = isLocal ? 'http://localhost:3000/' : '/admin/';
                    break;
                default:
                    setError('Account role not recognized.');
            }
        } else {
            setError('No sovereign profile found. Contact BIN-GROUP HQ.');
        }
    };

    const handleGoogleSignIn = async () => {
        setLoading(true);
        setError('');
        try {
            // [SOVEREIGN-AUDIT] Secure GoogleAuthProvider initialization with explicit flow params
            const provider = new GoogleAuthProvider();
            provider.setCustomParameters({ 
                prompt: 'select_account',
                // Explicitly request standard auth code flow scope
                auth_type: 'rerequest'
            });

            // Standardize on signInWithRedirect for Institutional Compliance on cross-origin SPA
            await signInWithRedirect(auth, provider);
        } catch (err: any) {
            console.error("🚨 [SSO-GATEWAY] Initiation Failure:", err);
            setError(err.message || 'Failed to initiate secure handshake.');
            setLoading(false);
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            await handleAuthSuccess(userCredential);
        } catch (err: any) {
            setError(err.message || 'Failed to login');
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1e293b] rounded-[24px] overflow-hidden border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">BIN Group OS</h2>
                        <p className="text-[#94a3b8] text-sm mt-1">Unified Authentication Gateway</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-[#ef4444] text-sm font-bold p-4 rounded-xl mb-6 text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="group">
                            <label className="block text-[#94a3b8] text-[10px] font-black uppercase tracking-widest mb-2 group-focus-within:text-emerald-500 transition-colors">Institutional Email</label>
                            <input
                                type="email"
                                placeholder="ceo@bingroup.ae"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <div className="group">
                            <label className="block text-[#94a3b8] text-[10px] font-black uppercase tracking-widest mb-2 group-focus-within:text-emerald-500 transition-colors">Access Key</label>
                            <input
                                type="password"
                                placeholder="••••••••"
                                required
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                className="w-full bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full bg-emerald-500 text-slate-900 font-black text-lg p-4 rounded-xl uppercase tracking-widest mt-4 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {loading ? 'Handshaking...' : 'Secure Login'}
                        </button>
                    </form>

                    <div className="mt-6 flex flex-col gap-4">
                        <div className="relative">
                            <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10"></span></div>
                            <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#1e293b] px-2 text-[#94a3b8]">Or Sovereign SSO</span></div>
                        </div>

                        <button
                            onClick={handleGoogleSignIn}
                            disabled={loading}
                            className="w-full bg-white/5 border border-white/10 text-white font-bold p-4 rounded-xl uppercase tracking-widest hover:bg-white/10 transition-all flex items-center justify-center gap-2"
                        >
                            <svg className="w-5 h-5" viewBox="0 0 24 24">
                                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                            </svg>
                            Sign in with Google
                        </button>
                    </div>
                </div>
            </div>
            
            {/* Branding Footer */}
            <div className="mt-8 text-center">
                <p className="text-[10px] text-[#94a3b8] font-black uppercase tracking-[0.2em]">
                    © 2026 BIN GROUP | ARCHITECTED FOR THE SEVEN EMIRATES | <a href="/privacy-policy.html" className="text-[#DAA520] no-underline ml-2 font-bold">Privacy Policy</a>
                </p>
            </div>
        </div>
    );
}
