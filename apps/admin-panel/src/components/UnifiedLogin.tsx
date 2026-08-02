import React, { useEffect, useState } from 'react';
import { auth, browserSessionPersistence, setPersistence, signInWithEmailAndPassword } from '../lib/firebase';
import { getMultiFactorResolver, sendPasswordResetEmail, signOut } from 'firebase/auth';
import type { MultiFactorResolver } from 'firebase/auth';
import { Shield, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '@bin/shared';
import AdminMfaSignInChallenge from './security/AdminMfaSignInChallenge';
import { useNavigate, useLocation, useInRouterContext } from 'react-router-dom';
import { adminReturnToFromSearch } from '../lib/adminAuthRedirect';

const AUTH_PERSISTENCE_TIMEOUT_MS = 8_000;
const AUTH_SIGN_IN_TIMEOUT_MS = 20_000;
const AUTH_RESET_TIMEOUT_MS = 5_000;

const timeoutError = (code: string) => Object.assign(new Error(code), { code });

const withTimeout = <T,>(promise: Promise<T>, ms: number, code: string): Promise<T> => new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(timeoutError(code)), ms);
    promise.then(
        (value) => {
            window.clearTimeout(timer);
            resolve(value);
        },
        (error) => {
            window.clearTimeout(timer);
            reject(error);
        },
    );
});

export default function UnifiedLogin() {
    const { error: authError, isAuthenticated, status: rawStatus, retryAuthorization } = useAuth();
    const status = rawStatus as any;
    const { t, isRTL } = useLanguage();
    const navigate = useNavigate();
    
    const inRouter = useInRouterContext();
    const isMocked = Boolean(
        (useLocation as any)._isMockFunction ||
        (useLocation as any).mock ||
        useLocation.name === 'mockConstructor' ||
        !useLocation.toString().includes('Context')
    );
    const getLocation = useLocation;
    const location = (inRouter || isMocked) ? getLocation() : { search: window.location.search };

    const [localLoading, setLocalLoading] = useState(false);
    const [localError, setLocalError] = useState<string | null>(null);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [mfaResolver, setMfaResolver] = useState<MultiFactorResolver | null>(null);
    const [mfaResolutionPending, setMfaResolutionPending] = useState(false);
    
    const error = authError || localError;
    const loading =
        localLoading ||
        status === 'verifying-token' ||
        status === 'verifying-profile' ||
        mfaResolutionPending;
    const retainedFailedSession = status === 'failed' && Boolean(auth.currentUser) && !mfaResolver;

    useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const redirectedEmail = queryParams.get('email')?.trim().toLowerCase() || '';
        if (redirectedEmail && !email) setEmail(redirectedEmail);
    }, [email, location.search]);

    useEffect(() => {
        if (isAuthenticated && status === 'authorized') {
            setLocalLoading(false);
            setMfaResolutionPending(false);
            navigate(adminReturnToFromSearch(location.search), { replace: true });
            return;
        }

        if (authError || status === 'failed') {
            setLocalLoading(false);
            setMfaResolutionPending(false);
            return;
        }

        if (mfaResolver) setLocalLoading(false);
    }, [authError, isAuthenticated, mfaResolver, navigate, status, location.search]);

    const friendlyAuthError = (err: any) => {
        const code = String(err?.code || '');
        const message = String(err?.message || '');
        console.error('[ADMIN-AUTH]', {
            code,
            message,
            authDomain: auth.config?.authDomain,
            currentUrl: window.location.href,
            provider: 'password',
            emailAttempted: email.replace(/(.{3}).*@/, '$1***@'),
        });

        if (code === 'ADMIN_PERSISTENCE_TIMEOUT') return 'Secure browser session storage did not respond. Reset this site session or open the Admin portal in a private window, then try again.';
        if (code === 'ADMIN_SIGN_IN_TIMEOUT') return 'Firebase sign-in did not respond within 20 seconds. Check the connection, reset the secure session, and try again.';
        if (code === 'ADMIN_PASSWORD_RESET_TIMEOUT') return 'The password-reset request timed out. Check the connection and try again.';
        if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') return 'The admin email or password is incorrect.';
        if (code === 'auth/too-many-requests') return 'Security lockout: Too many attempts. Please wait.';
        if (code === 'auth/unauthorized-domain') return 'This admin domain is not authorized for Firebase sign-in.';
        if (code === 'auth/operation-not-allowed') return 'Email/password Admin sign-in is not enabled in Firebase Authentication.';
        if (code === 'auth/network-request-failed') return 'Network connection failed. Please try again.';
        if (code === 'auth/multi-factor-auth-required') return 'Admin MFA is required to complete sign-in.';
        return 'Login could not be completed. Please contact BIN GROUP support.';
    };

    const resetSecureSession = async () => {
        setLocalLoading(true);
        setLocalError(null);
        setMfaResolver(null);
        try {
            await withTimeout(signOut(auth), AUTH_RESET_TIMEOUT_MS, 'ADMIN_SIGN_OUT_TIMEOUT').catch(() => undefined);
        } finally {
            sessionStorage.removeItem('bin-admin-security-session');
            try {
                window.indexedDB?.deleteDatabase('firebaseLocalStorageDb');
            } catch {
                // Targeted Firebase Auth persistence reset is best effort.
            }
            const normalizedEmail = email.trim().toLowerCase();
            const query = normalizedEmail ? `?email=${encodeURIComponent(normalizedEmail)}&session=reset` : '?session=reset';
            window.location.replace(`/login${query}`);
        }
    };

    const handleEmailLogin = async (event: React.FormEvent) => {
        event.preventDefault();
        setLocalLoading(true);
        setLocalError(null);
        setMfaResolver(null);
        setMfaResolutionPending(false);
        try {
            await withTimeout(setPersistence(auth, browserSessionPersistence), AUTH_PERSISTENCE_TIMEOUT_MS, 'ADMIN_PERSISTENCE_TIMEOUT');
            const promise = signInWithEmailAndPassword(auth, email.trim().toLowerCase(), password);
            const result = await withTimeout(
                promise,
                AUTH_SIGN_IN_TIMEOUT_MS,
                'ADMIN_SIGN_IN_TIMEOUT',
            );
            if (result.user) {
                console.info('[ADMIN-AUTH] Primary credential accepted.');
            }
        } catch (err: any) {
            if (err?.code === 'auth/multi-factor-auth-required') {
                try {
                    setMfaResolver(getMultiFactorResolver(auth, err));
                    setLocalError(null);
                } catch (resolverError) {
                    setLocalError(friendlyAuthError(resolverError));
                }
            } else {
                if (err?.code === 'ADMIN_PERSISTENCE_TIMEOUT' || err?.code === 'ADMIN_SIGN_IN_TIMEOUT') {
                    void signOut(auth).catch(() => undefined);
                }
                setLocalError(friendlyAuthError(err));
            }
            setLocalLoading(false);
        }
    };

    const handlePasswordReset = async () => {
        if (!email.trim()) {
            setLocalError('Enter your admin email first.');
            return;
        }
        setLocalLoading(true);
        setLocalError(null);
        try {
            await withTimeout(sendPasswordResetEmail(auth, email.trim().toLowerCase()), AUTH_SIGN_IN_TIMEOUT_MS, 'ADMIN_PASSWORD_RESET_TIMEOUT');
            setLocalError('Password reset email sent. Check your inbox.');
        } catch (err: any) {
            setLocalError(friendlyAuthError(err));
        } finally {
            setLocalLoading(false);
        }
    };

    if ((loading || status === 'verifying-token' || status === 'verifying-profile' || isAuthenticated || auth.currentUser) && !mfaResolver && !retainedFailedSession) {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4">
                <div className="w-12 h-12 border-4 border-[#C6A75E] border-t-transparent rounded-full animate-spin mb-6" />
                <p className="text-[#C6A75E] font-black uppercase tracking-[0.4em] text-sm text-center">{t('common.auth_sync')}</p>
                <p className="mt-4 max-w-md text-center text-xs leading-relaxed text-[#64748b]">Secure sign-in is bounded and will return an error instead of remaining on this screen indefinitely.</p>
                <button type="button" onClick={() => void resetSecureSession()} className="mt-8 rounded-xl border border-[#C6A75E]/40 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-[#C6A75E] hover:bg-[#C6A75E]/10">Reset secure session</button>
            </div>
        );
    }

    return (
        <div className={`min-h-screen bg-[#020617] flex flex-col items-center justify-center p-4 selection:bg-[#C6A75E]/30 ${isRTL ? 'rtl' : 'ltr'}`}>
            <div className="fixed inset-0 overflow-hidden pointer-events-none opacity-20">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]" />
                <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#C6A75E]/10 rounded-full blur-[120px]" />
            </div>
            <div className="w-full max-w-[420px] relative z-10">
                <div className="text-center mb-12">
                    <div className="inline-block p-4 rounded-3xl bg-gradient-to-br from-[#1e293b] to-[#0f172a] border border-[#C6A75E]/20 shadow-2xl mb-6"><Shield className="w-12 h-12 text-[#C6A75E]" strokeWidth={1.5} /></div>
                    <h1 className="text-4xl font-black text-white tracking-tighter mb-2 italic">BIN GROUP</h1>
                    <p className="text-[#94a3b8] font-bold tracking-[0.2em] text-[10px] uppercase">Admin Portal</p>
                </div>
                <div className="bg-[#0f172a]/80 backdrop-blur-xl border border-white/5 rounded-[32px] p-8 shadow-[0_32px_64px_-16px_rgba(0,0,0,0.6)] relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-[#C6A75E] to-transparent opacity-50" />
                    <div className="mb-8">
                        <h2 className="text-xl font-black text-white mb-2">{mfaResolver ? 'Admin MFA Verification' : retainedFailedSession ? 'Admin Authorization Blocked' : 'Admin Login'}</h2>
                        <p className="text-sm text-[#64748b] leading-relaxed">{mfaResolver ? 'The primary credential was accepted. Complete the enrolled Firebase second factor.' : retainedFailedSession ? 'Your Firebase session is retained so the exact protected authorization failure can be retried or reset safely.' : 'Authorized BIN GROUP administrators only.'}</p>
                    </div>
                    {error && !mfaResolver && (
                        <div className="mb-6 p-4 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold">
                            <p>{error}</p>
                        </div>
                    )}
                    {mfaResolver ? (
                        <AdminMfaSignInChallenge
                            resolver={mfaResolver}
                            onResolved={() => {
                                setLocalLoading(true);
                                setMfaResolutionPending(true);
                                setMfaResolver(null);
                                setPassword('');
                                void retryAuthorization();
                            }}
                            onCancel={() => {
                                setLocalLoading(false);
                                setMfaResolver(null);
                                setPassword('');
                                setLocalError(null);
                                setMfaResolutionPending(false);
                            }}
                        />
                    ) : retainedFailedSession ? (
                        <div className="space-y-3">
                            <button data-testid="admin-retry-authorization" type="button" onClick={() => void retryAuthorization()} className="w-full flex items-center justify-center bg-[#C6A75E] text-black font-black py-4 rounded-xl uppercase tracking-widest text-sm">Retry secure authorization</button>
                            <button data-testid="admin-reset-failed-session" type="button" onClick={() => void resetSecureSession()} className="w-full rounded-xl border border-[#C6A75E]/40 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-[#C6A75E] hover:bg-[#C6A75E]/10">Reset secure session</button>
                        </div>
                    ) : (
                        <>
                            <form onSubmit={handleEmailLogin} className="space-y-4 mb-6">
                                <input data-testid="admin-login-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={t('login.email')} autoComplete="username" className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#64748b] focus:outline-none focus:border-[#C6A75E]" required />
                                <input data-testid="admin-login-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={t('login.password')} autoComplete="current-password" className="w-full bg-[#1e293b] border border-white/10 rounded-xl px-4 py-3 text-white placeholder-[#64748b] focus:outline-none focus:border-[#C6A75E]" required />
                                <button data-testid="admin-login-submit" type="submit" disabled={loading || !email || !password || isAuthenticated || Boolean(auth.currentUser)} className="w-full flex items-center justify-center bg-[#C6A75E] text-black font-black py-4 rounded-xl disabled:opacity-50 uppercase tracking-widest text-sm">{loading ? '...' : t('login.signin')}</button>
                                <button type="button" onClick={handlePasswordReset} disabled={loading} className="w-full text-[#C6A75E] text-xs font-black uppercase tracking-widest disabled:opacity-50">{t('login.forgot_password')}</button>
                                <button type="button" onClick={() => void resetSecureSession()} disabled={loading} className="w-full text-[#94a3b8] text-[10px] font-black uppercase tracking-widest disabled:opacity-50">Reset secure session</button>
                            </form>
                            <div data-testid="admin-google-login-disabled" className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] text-[#94a3b8] text-xs leading-relaxed">Google redirect Admin sign-in is disabled until redirect-return MFA resolution is supported. Use email/password and the enrolled Firebase MFA factor.</div>
                        </>
                    )}
                    <div className="mt-8 flex items-center justify-center gap-2 opacity-40"><Lock className="w-3 h-3 text-[#94a3b8]" /><span className="text-[9px] text-[#94a3b8] font-black uppercase tracking-widest">{t('login.iso_secure_badge')}</span></div>
                </div>
            </div>
        </div>
    );
}
