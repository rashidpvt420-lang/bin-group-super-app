import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { setupSovereignAlertInterceptor } from '@bin/shared';

setupSovereignAlertInterceptor();

let reactMounted = false;

// [STABILITY-PROTOCOL] Global System Recovery
// Only replace the root during true pre-mount bootstrap failures. After React is mounted,
// log recoverable promise rejections instead of wiping the whole admin console.
const renderBootError = (msg: any, error: any) => {
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

(window as any).onerror = (msg: any, url: any, line: any, col: any, error: any) => {
  if (!reactMounted) renderBootError(msg, error);
  else console.error('[ADMIN-RUNTIME] Window error after mount:', msg, error);
};

(window as any).onunhandledrejection = (event: any) => {
  const reason = event?.reason || 'Unknown';
  if (!reactMounted) renderBootError('Unhandled Promise Rejection: ' + reason, reason);
  else console.warn('[ADMIN-RUNTIME] Recoverable promise rejection after mount:', reason);
};

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);

    // [STABILITY] Unregister Service Workers without allowing a cache purge failure
    // to crash the entire admin console.
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (const registration of registrations) {
                registration.unregister();
                console.log('🛡️ [INIT] Purged Administrative Cache.');
            }
        }).catch((error) => {
            console.warn('[ADMIN-INIT] Service worker cleanup skipped:', error);
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
        reactMounted = true;
    } catch (err) {
        console.error('[ADMIN-SYSTEM] Critical Mount Error:', err);
        renderBootError('Bootstrap Execution Fault', err);
    }
}
