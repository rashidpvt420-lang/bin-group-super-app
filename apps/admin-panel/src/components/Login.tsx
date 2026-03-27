import React, { useState } from 'react';
import { auth, db } from '../lib/firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';

export default function Login() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Gateway: Fetch Role
            const docRef = doc(db, 'users', user.uid);
            const docSnap = await getDoc(docRef);

            if (docSnap.exists()) {
                const role = docSnap.data().role;

                const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
                
                // Redirect based on role
                switch (role) {
                    case 'TENANT':
                        window.location.href = isLocal ? 'http://localhost:5173/' : 'https://studio-5724711541-8a962-tenant.web.app/';
                        break;
                    case 'TECHNICIAN':
                        window.location.href = isLocal ? 'http://localhost:5174/' : 'https://studio-5724711541-8a962-tech.web.app/';
                        break;
                    case 'OWNER':
                        window.location.href = isLocal ? 'http://localhost:5175/' : 'https://studio-5724711541-8a962-owner.web.app/';
                        break;
                    case 'ADMIN':
                        window.location.href = isLocal ? 'http://localhost:3000/' : 'https://studio-5724711541-8a962-admin.web.app/';
                        break;
                    default:
                        setError('Account role not recognized.');
                }
            } else {
                setError('No user profile found in database.');
            }
        } catch (err: any) {
            setError(err.message || 'Failed to login');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0f172a] flex flex-col items-center justify-center p-4">
            <div className="w-full max-w-md bg-[#1e293b] rounded-[24px] overflow-hidden border border-white/10 shadow-[0_25px_50px_-12px_rgba(0,0,0,0.5)]">
                <div className="p-8">
                    <div className="text-center mb-8">
                        <h2 className="text-2xl font-black text-white uppercase tracking-tighter">BIN Group OS</h2>
                        <p className="text-[#94a3b8] text-sm mt-1">CEO Command Center Gateway</p>
                    </div>

                    {error && (
                        <div className="bg-red-500/10 border border-red-500/20 text-[#ef4444] text-sm font-bold p-4 rounded-xl mb-6 text-center">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                        <div className="group">
                            <label htmlFor="email" className="block text-[#94a3b8] text-[10px] font-black uppercase tracking-widest mb-2 group-focus-within:text-emerald-500 transition-colors">Email Address</label>
                            <input
                                id="email"
                                type="email"
                                title="Email Address"
                                placeholder="ceo@bingroup.ae"
                                required
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                className="w-full bg-[#0f172a]/50 border border-white/10 rounded-xl px-4 py-3 text-white outline-none focus:border-emerald-500/50 transition-all placeholder:text-slate-700"
                            />
                        </div>
                        <div className="group">
                            <label htmlFor="password" className="block text-[#94a3b8] text-[10px] font-black uppercase tracking-widest mb-2 group-focus-within:text-emerald-500 transition-colors">Password</label>
                            <input
                                id="password"
                                type="password"
                                title="Password"
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
                            className={`w-full bg-[#10b981] text-[#0f172a] font-black text-lg p-4 rounded-xl uppercase tracking-widest mt-4 transition-all hover:scale-[1.02] active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(16,185,129,0.3)]`}
                        >
                            {loading ? 'Authenticating...' : 'Secure Login'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}
