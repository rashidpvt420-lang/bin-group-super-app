import React, { useEffect, useRef, useState } from 'react';
import { auth, signInWithEmailAndPassword } from '../lib/firebase';
import {
    GoogleAuthProvider,
    sendPasswordResetEmail,
    signInWithRedirect,
    getRedirectResult,
    setPersistence,
    browserLocalPersistence,
    signOut
} from 'firebase/auth';
import { Shield, Lock, Globe } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '@bin/shared';

export default function UnifiedLogin() {
    const { loading: authLoading, error: authError } = useAuth();
    const { t, isRTL } = useLanguage();
    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [diagnostic, setDiagnostic] = useState('Admin login ready. Use Google or email/password.');
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const redirectWatchdogRef = useRef<number | null>(null);

    const error = authError || localError;
    const loading = authLoading;
    const actionLoading = localLoading;

    const clearRedirectWatchdog = () => {
        if (redirectWatchdogRef.current !== null) {
            window.clearTimeout(redirectWatchdogRef.current);
            redirectWatchdogRef.current = null;
        }
    };

    const getFriendlyAuthError = (err: any) => {
        const code = err?.code || '';
        const message = err?.message || '';

        console.error('🛡️ [AUTH_DIAGNOSTIC]', {
            code,
            message,
            authDomain: auth.config?.authDomain,
            currentUrl: window.location.href,
            provider: code.includes('google') ? 'google.com' : 'password',
            env: process.env.NODE_ENV,
            timestamp: new Date().toISOString(),
            userAgent: navigator.userAgent,
            emailAttempted: email.replace(/(.{3}).*@/, '$1***@')
        });

        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
            return 'The admin email or password is incorrect.';
        }
        if (code === 'auth/unauthorized-domain') {
            return 'Google sign-in domain is not authorized in Firebase Auth. Add bin-group-admin-panel.web.app under Firebase Authentication > Settings > Authorized domains.';
        }
        if (code === 'auth/operation-not-allowed') {
            return 'Google sign-in is not enabled in Firebase Authentication providers.';
        }
        if (code === 'auth/too-many-requests') {
            return 'Too many login attempts. Please wait and try again.';
        }
        if (code === 'auth/redirect-cancelled-by-user' || code === 'auth/popup-closed-by-user') {
            return 'Google sign-in was cancelled.';
        }
        if (code === 'auth/popup-blocked' || code === 'auth/cancelled-popup-request') {
            return 'Popup sign-in was blocked. This admin panel uses redirect sign-in; retry the Google button.';
        }
        if (code === 'auth/network-request-failed') {
            return 'Network connection failed. Check internet connection and retry.';
        }

        return message ? `Login could not be completed: ${message}` : 'Login could not be completed. Please contact BIN GROUP support.';
    };

    useEffect(() => {
        let active = true;
        setDiagnostic(`Admin login build active on ${window.location.hostname}. Auth domain: ${auth.config?.authDomain || 'unknown'}.`);
        getRedirectResult(auth)
            .then((result) => {
                if (!active) return;
                clearRedirectWatchdog();
                if (result?.user) {
                    setLocalLoading(false);
                    setDiagnostic(`Google returned ${result.user.email || 'admin account'}. Verifying admin permission...`);
                    sessionStorage.removeItem('bin_admin_google_redirect_started');
                } else if (sessionStorage.getItem('bin_admin_google_redirect_started') === '1') {
                    setLocalLoading(false);
                    setDiagnostic('Returned from Google. Waiting for Firebase auth state. If this remains, check Firebase authorized domains/provider and admin email permissions.');
                }
            })
            .catch((err: any) => {
                if (!active) return;
                clearRedirectWatchdog();
                const friendly = getFriendlyAuthError(err);
                setLocalError(friendly);
                setLocalLoading(false);
                setDiagnostic(`Google redirect failed: ${err?.code || err?.message || 'unknown error'}`);
                sessionStorage.removeItem('bin_admin_google_redirect_started');
            });
        return () => {
            active = false;
            clearRedirectWatchdog();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleGoogleLogin = async () => {
        setLocalLoading(true);
        setLocalError(null);
        const provider = new GoogleAuthProvider();
        provider.setCustomParameters({ prompt: 'select_account' });
        try {
            console.log('🔍 [DIAG] Starting Admin Google redirect SSO...');
            setDiagnostic('Opening Google sign-in. Choose the Firebase admin account.');
            sessionStorage.setItem('bin_admin_google_redirect_started', '1');
            await setPersistence(auth, browserLocalPersistence);
            clearRedirectWatchdog();
            redirectWatchdogRef.current = window.setTimeout(() => {
                if (sessionStorage.getItem('bin_admin_google_redirect_started') === '1') {
                    setLocalLoading(false);
                    setLocalError('Google sign-in did not open or return. Use Chrome/Safari directly, then verify Firebase Auth authorized domains include bin-group-admin-panel.web.app.');
                    setDiagnostic('Google redirect watchdog expired. This usually means the mobile browser blocked the redirect helper or Firebase Auth domain/provider is not configured.');
                }
            }, 8000);
            await signInWithRedirect(auth, provider);
        } catch (err: any) {
            clearRedirectWatchdog();
            sessionStorage.removeItem('bin_admin_google_redirect_started');
            setLocalError(getFriendlyAuthError(err));
            setDiagnostic(`Google sign-in could not start: ${err?.code || err?.message || 'unknown error'}`);
            setLocalLoading(false);
        }
    };

    const handleEmailLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        setLocalLoading(true);
        setLocalError(null);
        try {
            console.log('🔍 [DIAG] Validating admin credentials...');
            setDiagnostic('Checking admin email/password with Firebase Auth...');
            await setPersistence(auth, browserLocalPersistence);
            const result = await signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password.trim());
            if (result.user) {
                setDiagnostic(`Signed in as ${result.user.email}. Verifying admin permission...`);
                console.log('🛡️ [AUTH] Admin login successful for:', result.user.email);
            }
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setDiagnostic(`Email/password sign-in failed: ${err?.code || err?.message || 'unknown error'}`);
            setLocalLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email) {
            setLocalError('Enter your admin email first.');
            return;
        }

        setLocalLoading(true);
        setLocalError(null);
        try {
            await sendPasswordResetEmail(auth, email.trim().toLowerCase());
            setLocalError('Password reset email sent. Check your inbox.');
            setDiagnostic(`Password reset sent to ${email.trim().toLowerCase()}.`);
        } catch (err: any) {
            setLocalError(getFriendlyAuthError(err));
            setDiagnostic(`Password reset failed: ${err?.code || err?.message || 'unknown error'}`);
        } finally {
            setLocalLoading(false);
        }
    };

    const handleResetLocalSession = async () => {
        try {
            const lang = localStorage.getItem('bin_language');
            localStorage.clear();
            sessionStorage.clear();
            if (lang) localStorage.setItem('bin_language', lang);
            await signOut(auth);
        } catch (err) {
            console.warn('[ADMIN-AUTH] Reset local session warning:', err);
        } finally {
            window.location.href = '/login?reset=1';
        }
    };

    if (loading && !error) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-[#C6A75E] border-t-transparent rounded-full animate-spin mb-6"></div>
                <p className="text-[#C6A75E] font-black uppercase tracking-[0.4em] text-sm text-center">
                    {t('common.auth_sync')}
                </p>
                <p className="text-[#94a3b8] text-xs font-bold mt-4 text-center max-w-sm">{diagnostic}</p>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 selection:bg-[#C6A75E]/30 ${isRTL ? 'rtl' : 'ltr'}`}>
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]"></div>
            </div>

            <div className="w-full max-w-[420px] relative z-10">
                <div className="text-center mb-12">
                    <div className="inline-block p-4 rounded-3xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#C6A75E]/20 shadow-2xl mb-6">
                        <Shield className="w-12 h-12 text-[#C6A75E]" strokeWidth={1.5} />
                    </div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2">
                        BIN GROUP
                    </h1>
                    <p className="text-[#94a3b8] font-bold tracking-[0.2em] text-[10px] uppercase">
                        Admin Control Panel
                    </p>
                </div>

                <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C6A75E] to-transparent opacity-50"></div>

                    <div className="mb-8">
                        <h2 className="text-xl font-black text-white mb-2">Admin Login</h2>
                        <p className="text-sm text-[#64748b] leading-relaxed">
                            Authorized BIN GROUP admin access only.
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
                            disabled={actionLoading || !email || !password}
                            className="w-full relative flex items-center justify-center bg-[#C6A75E] text-black font-black py-4 rounded-xl transition-all hover:bg-[#d4b76e] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-widest text-sm"
                        >
                            {actionLoading ? 'Checking...' : t('login.signin')}
                        </button>
                        <button
                            type="button"
                            onClick={handlePasswordReset}
                            disabled={actionLoading}
                            className="w-full text-[#C6A75E] text-xs font-black uppercase tracking-widest hover:text-white transition-colors disabled:opacity-50"
                        >
                            Forgot password
                        </button>
                    </form>

                    <div className="flex items-center gap-4 mb-6 opacity-50">
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                        <span className="text-[10px] text-white font-bold uppercase tracking-widest">Or</span>
                        <div className="h-[1px] flex-1 bg-white/20"></div>
                    </div>

                    <button
                        type="button"
                        onClick={handleGoogleLogin}
                        disabled={actionLoading}
                        className="w-full group relative flex items-center justify-center bg-white text-black font-black py-4 px-8 rounded-xl transition-all duration-300 hover:bg-gray-200 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <div className="flex items-center gap-3">
                            <Globe className="w-5 h-5" />
                            <span className="uppercase tracking-widest text-sm">{actionLoading ? 'Opening Google...' : 'Sign in with Google'}</span>
                        </div>
                    </button>

                    <div className="mt-5 p-3 rounded-2xl bg-white/5 border border-white/10 text-[#94a3b8] text-[11px] font-bold leading-relaxed">
                        {diagnostic}
                    </div>

                    <button
                        type="button"
                        onClick={handleResetLocalSession}
                        disabled={actionLoading}
                        className="mt-4 w-full text-[#94a3b8] text-[10px] font-black uppercase tracking-widest hover:text-[#C6A75E] transition-colors disabled:opacity-50"
                    >
                        Reset local login session
                    </button>

                    <div className="mt-8 flex items-center justify-center gap-2 opacity-40">
                        <Lock className="w-3 h-3 text-[#94a3b8]" />
                        <span className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest">
                            Protected admin access
                        </span>
                    </div>
                </div>

                <div className="mt-12 text-center opacity-40">
                    <p className="text-[9px] text-[#94a3b8] font-black uppercase tracking-[0.3em]">
                        BIN GROUP ADMIN PANEL · 2026-06-19 AUTH WATCHDOG
                    </p>
                </div>
            </div>
        </div>
    );
}
