import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { setupSovereignAlertInterceptor } from '@bin/shared';

try {
  setupSovereignAlertInterceptor();
} catch (err) {
  console.warn('[ADMIN-BOOT] Alert interceptor startup skipped:', err);
}

const renderFatalBootFallback = (msg: unknown, error: unknown) => {
  const debugId = `ADMIN-BOOT-${Date.now().toString(36).toUpperCase()}`;
  console.error(`[${debugId}] Admin bootstrap error:`, msg, error);
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#020617; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
      <h2 style="color:#DAA520;">Admin Console Could Not Start</h2>
      <p style="opacity:0.75; max-width:560px;">The admin console hit a startup problem. Please reload once. If it continues, contact BIN-GROUPS support with debug ID <strong>${debugId}</strong>.</p>
      <button onclick="window.location.reload()" style="margin-top:30px; background:#DAA520; border:none; color:#000; padding:12px 30px; font-weight:900; cursor:pointer; border-radius:5px;">RELOAD TERMINAL</button>
    </div>`;
  }
};

const isKnownRecoverableBootNoise = (message: string) => {
  const normalized = message.toLowerCase();
  return (
    normalized.includes('resizeobserver loop') ||
    normalized.includes('failed to register a serviceworker') ||
    normalized.includes('service worker') ||
    normalized.includes('messaging') ||
    normalized.includes('notification') ||
    normalized.includes('permission-denied') ||
    normalized.includes('popup-closed-by-user')
  );
};

(window as any).onerror = (msg: any, url: any, line: any, col: any, error: any) => {
  const message = String(error?.message || msg || '');
  if (isKnownRecoverableBootNoise(message)) {
    console.warn('[ADMIN-BOOT] Recoverable browser/runtime event:', message);
    return true;
  }
  console.error('[ADMIN-BOOT] Runtime error after shell boot:', { msg, url, line, col, error });
  return false;
};

(window as any).onunhandledrejection = (event: any) => {
  const reason = event?.reason;
  const message = String(reason?.message || reason || 'Unhandled Promise Rejection');
  if (isKnownRecoverableBootNoise(message)) {
    console.warn('[ADMIN-BOOT] Recoverable async event:', message);
    event?.preventDefault?.();
    return;
  }
  console.error('[ADMIN-BOOT] Async startup event:', reason);
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);

    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations()
            .then((registrations) => {
                for (const registration of registrations) {
                    registration.unregister().catch((err) => {
                        console.warn('[ADMIN-BOOT] Service worker unregister skipped:', err);
                    });
                }
                console.log('🛡️ [INIT] Administrative cache checked.');
            })
            .catch((err) => {
                console.warn('[ADMIN-BOOT] Service worker cleanup skipped:', err);
            });
    }

    try {
        root.render(
            <React.StrictMode>
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </React.StrictMode>
        );
    } catch (err) {
        renderFatalBootFallback('Bootstrap Execution Fault', err);
    }
} else {
    renderFatalBootFallback('Missing root element', null);
}
