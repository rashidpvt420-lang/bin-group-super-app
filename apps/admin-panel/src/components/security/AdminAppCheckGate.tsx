import React, { useCallback, useEffect, useState } from 'react';
import { getToken } from 'firebase/app-check';
import { AlertTriangle, RotateCcw, ShieldCheck } from 'lucide-react';
import { app, appCheck } from '../../lib/firebase';

const EXPECTED_ADMIN_FIREBASE = Object.freeze({
    projectId: 'bin-group-57c60',
    authDomain: 'bin-group-57c60.firebaseapp.com',
    appId: '1:123413252227:web:285cb53bc26626d699f3b6',
});

const APP_CHECK_TIMEOUT_MS = 15_000;

type GateState =
    | { status: 'checking'; message: string }
    | { status: 'ready'; message: string }
    | { status: 'blocked'; message: string; code: string };

const clean = (value?: string) => String(value || '').trim();

const withTimeout = <T,>(promise: Promise<T>, timeoutMs: number): Promise<T> =>
    new Promise<T>((resolve, reject) => {
        const timer = window.setTimeout(
            () => reject(Object.assign(new Error('ADMIN_APPCHECK_TIMEOUT'), { code: 'ADMIN_APPCHECK_TIMEOUT' })),
            timeoutMs,
        );
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

const errorCode = (error: unknown) => {
    if (typeof error === 'object' && error !== null && 'code' in error) {
        return clean(String((error as { code?: unknown }).code || 'ADMIN_APPCHECK_FAILED'));
    }
    return 'ADMIN_APPCHECK_FAILED';
};

const publicMessage = (code: string) => {
    if (code === 'ADMIN_FIREBASE_IDENTITY_MISMATCH') {
        return 'The Admin portal loaded a Firebase identity that does not match the approved production application.';
    }
    if (code === 'ADMIN_APPCHECK_NOT_INITIALIZED') {
        return 'The Admin App Check client was not initialized for this portal.';
    }
    if (code === 'ADMIN_APPCHECK_TIMEOUT') {
        return 'The Admin security handshake timed out. Check the connection and retry.';
    }
    if (code.includes('appCheck/recaptcha-error') || code.includes('appCheck/fetch-status-error')) {
        return 'The Admin App Check registration or reCAPTCHA domain configuration rejected this portal.';
    }
    if (code.includes('appCheck')) {
        return 'The Admin App Check token could not be verified for this portal.';
    }
    return 'The Admin security handshake could not be verified.';
};

const shouldVerifyRuntimeAppCheck = () => {
    if (typeof window === 'undefined') return false;
    const hostname = window.location.hostname.toLowerCase();
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    return process.env.NODE_ENV === 'production' &&
        !isLocal &&
        clean(process.env.REACT_APP_ENABLE_FIREBASE_APPCHECK) === 'true';
};

export default function AdminAppCheckGate({ children }: { children: React.ReactNode }) {
    const [gate, setGate] = useState<GateState>({
        status: shouldVerifyRuntimeAppCheck() ? 'checking' : 'ready',
        message: shouldVerifyRuntimeAppCheck()
            ? 'Verifying the Admin security handshake…'
            : 'Runtime App Check verification is not required in this environment.',
    });

    const verify = useCallback(async () => {
        if (!shouldVerifyRuntimeAppCheck()) {
            setGate({
                status: 'ready',
                message: 'Runtime App Check verification is not required in this environment.',
            });
            return;
        }

        setGate({ status: 'checking', message: 'Verifying the Admin security handshake…' });

        try {
            const options = app.options;
            if (
                options.projectId !== EXPECTED_ADMIN_FIREBASE.projectId ||
                options.authDomain !== EXPECTED_ADMIN_FIREBASE.authDomain ||
                options.appId !== EXPECTED_ADMIN_FIREBASE.appId
            ) {
                throw Object.assign(new Error('ADMIN_FIREBASE_IDENTITY_MISMATCH'), {
                    code: 'ADMIN_FIREBASE_IDENTITY_MISMATCH',
                });
            }
            if (!appCheck) {
                throw Object.assign(new Error('ADMIN_APPCHECK_NOT_INITIALIZED'), {
                    code: 'ADMIN_APPCHECK_NOT_INITIALIZED',
                });
            }

            const result = await withTimeout(
                getToken(appCheck, false),
                APP_CHECK_TIMEOUT_MS,
            );
            if (!clean(result.token)) {
                throw Object.assign(new Error('ADMIN_APPCHECK_EMPTY_TOKEN'), {
                    code: 'ADMIN_APPCHECK_EMPTY_TOKEN',
                });
            }

            console.info('[ADMIN-APPCHECK] Runtime token verified.', {
                projectId: options.projectId,
                appIdSuffix: String(options.appId || '').slice(-12),
                host: window.location.hostname,
            });
            setGate({ status: 'ready', message: 'Admin security handshake verified.' });
        } catch (error) {
            const code = errorCode(error);
            console.error('[ADMIN-APPCHECK] Runtime verification blocked credential submission.', {
                code,
                projectId: app.options.projectId,
                appIdSuffix: String(app.options.appId || '').slice(-12),
                host: window.location.hostname,
            });
            setGate({ status: 'blocked', code, message: publicMessage(code) });
        }
    }, []);

    useEffect(() => {
        void verify();
    }, [verify]);

    if (gate.status === 'ready') return <>{children}</>;

    if (gate.status === 'checking') {
        return (
            <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
                <ShieldCheck className="h-12 w-12 text-[#C6A75E]" aria-hidden="true" />
                <div className="mt-6 h-10 w-10 animate-spin rounded-full border-4 border-[#C6A75E] border-t-transparent" />
                <h1 className="mt-6 text-lg font-black text-white">Admin security verification</h1>
                <p className="mt-3 max-w-md text-sm leading-relaxed text-slate-400">{gate.message}</p>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
            <AlertTriangle className="h-12 w-12 text-amber-400" aria-hidden="true" />
            <h1 className="mt-6 text-xl font-black text-white">Admin login is securely blocked</h1>
            <p className="mt-3 max-w-lg text-sm leading-relaxed text-slate-300">{gate.message}</p>
            <p className="mt-3 max-w-lg text-xs leading-relaxed text-slate-500">
                No email or password was submitted. Verify the App Check registration for the approved Firebase web app and allow
                <span className="font-bold text-slate-300"> bin-group-admin-panel.web.app</span>, then retry.
            </p>
            <p className="mt-4 rounded-lg border border-white/10 bg-white/5 px-3 py-2 font-mono text-[11px] text-slate-400">
                {gate.code}
            </p>
            <button
                type="button"
                onClick={() => void verify()}
                className="mt-6 inline-flex items-center gap-2 rounded-xl border border-[#C6A75E]/50 px-5 py-3 text-xs font-black uppercase tracking-wider text-[#C6A75E] hover:bg-[#C6A75E]/10"
            >
                <RotateCcw className="h-4 w-4" aria-hidden="true" />
                Retry security check
            </button>
        </div>
    );
}
