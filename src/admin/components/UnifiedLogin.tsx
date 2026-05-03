import React, { useState } from 'react';
import { auth, signInWithPopup, signInWithEmailAndPassword } from '@/lib/firebase';
import { 
    GoogleAuthProvider,
    sendPasswordResetEmail
} from 'firebase/auth';
import { Shield, Lock, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '@bin/shared';

export default function UnifiedLogin() {
    const { loading: authLoading, error: authError } = useAuth();
    const { t, isRTL } = useLanguage();
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');

    const error = authError || localError;
    const loading = authLoading || localLoading;

    const getFriendlyAuthError = (err: any) => {
        const code = err?.code || '';
        const message = err?.message || '';
        
        // Institutional Diagnostic Logging
        console.error("🛡️ [AUTH_DIAGNOSTIC]", {
            code,
            message,
            authDomain: auth.config?.authDomain,
            currentUrl: window.location.href,
            provider: code.includes('google') ? 'google.com' : 'password',
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            emailAttempted: email.replace(/(.{3}).*@/, "$1***@")
        });

        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
            return 'The institutional email or passcode is incorrect.';
        }
        if (code === 'auth/too-many-requests') {
            return 'Security lockout: Too many attempts. Please wait.';
        }
        if (code === 'auth/popup-closed-by-user') {
            return 'SSO Handshake cancelled by operator.';
        }
        if (code === 'auth/network-request-failed') {
            return 'Protocol timeout: Network connection failed.';
        }
        
        return 'Login could not be completed. Please contact BIN GROUP support.';
    };

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setLocalError(null);
        const provider = new GoogleAuthProvider();
        try {
            console.log("🔍 [DIAG] Starting Admin SSO Handshake...");
            const result = await signInWithPopup(auth, provider);
            if (result.user) {
                console.log("🛡️ [AUTH] Admin SSO successful for:", result.user.email);
            }
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setLocalLoading(false);
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalLoading(true);
        setLocalError(null);
        try {
            console.log("🔍 [DIAG] Validating Administrative Credentials...");
            const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password.trim());
            if (result.user) {
                console.log("🛡️ [AUTH] Admin Secure Login successful for:", result.user.email);
            }
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setLocalLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            setLocalError('Enter your administrative email first.');
            return;
        }

        setLocalLoading(true);
        setLocalError(null);
        try {
            await sendPasswordResetEmail(auth, email);
            setLocalError('Recovery protocol initiated. Check your email.');
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
        } finally {
            setLocalLoading(false);
        }
    };

    if (loading && !error) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-[#C6A75E] border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-[#C6A75E] font-black uppercase tracking-[0.4em] text-sm text-center">
                    {t('common.auth_sync')}
                </p>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 selection:bg-[#C6A75E]/30 ${isRTL ? 'rtl' : 'ltr'}`}>
            {/* Background Branding */}
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="w-full max-w-[420px] relative z-10">
                {/* Branding Section */}
                <div className="text-center mb-12">
                    <div className="inline-block p-4 rounded-3xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#C6A75E]/20 shadow-2xl mb-6">
                        <Shield className="w-12 h-12 text-[#C6A75E]" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2 italic">
                        BIN-ADMINISTRY<span className="text-[#C6A75E]">™</span>
                    </h1>
                    <p className="text-[#94a3b8] font-bold tracking-[0.2em] text-[10px] uppercase">
                        Sovereign Command & Control Center
                    </p>
                </div>

                {/* Login Card */}
                <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C6A75E] to-transparent opacity-50"></div>
                    
                    <div className="mb-8">
                        <h2 className="text-xl font-black text-white mb-2">{t('login.portal')}</h2>
                        <p className="text-sm text-[#64748b] leading-relaxed">
                            {t('login.authorized_only')}
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse shrink-0"></div>
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
                        <div>
                            <input
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder={t('login.email')}
                                className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#64748b] focus:outline-none focus:border-[#C6A75E] transition-colors"
                                required
                            />
                        </div>
                        <div>
                            <input
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder={t('login.password')}
                                className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#64748b] focus:outline-none focus:border-[#C6A75E] transition-colors"
                                required
                            />
                        </div>
                        <button 
                            type="submit"
                            disabled={loading || !email || !password}
                            className="w-full relative flex items-center justify-center bg-[#C6A75E] text-black font-black py-4 rounded-xl transition-all hover:bg-[#d4b76e] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
                        >
                            {loading ? '...' : t('login.signin')}
                        </button>
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={loading}
                            className="w-full text-[#C6A75E] text-xs font-black uppercase tracking-widest hover:text-white transition-colors disabled:opacity-50"
                        >
                            {t('login.forgot_password')}
                        </button>
                    </form>

                    <div className="flex items-center gap-4 mb-6 opacity-50">
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                        <span className="text-[10px] text-white font-bold uppercase tracking-widest">Or SSO</span>
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                    </div>

                    <button 
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={loading}
                        className="w-full group relative flex items-center justify-center bg-white text-black font-black py-4 px-8 rounded-xl transition-all duration-300 hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-3">
                            <Globe className="w-5 h-5" />
                            <span className="uppercase tracking-widest text-sm">{t('login.google')}</span>
                        </div>
                    </button>

                    <div className="mt-8 flex items-center justify-center gap-2 opacity-40">
                        <Lock className="w-3 h-3 text-[#94a3b8]" />
                        <span className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest">
                            {t('login.iso_secure_badge')}
                        </span>
                    </div>
                </div>

                <div className="mt-12 text-center opacity-40">
                    <p className="text-[9px] text-[#94a3b8] font-black uppercase tracking-[0.3em]">
                        BIN-Groups CORE v1.23-STABLE
                    </p>
                </div>
            </div>
        </div>
    );
}
