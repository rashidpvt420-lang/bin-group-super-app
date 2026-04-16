import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

// [STABILITY-PROTOCOL] Global System Recovery
const handleError = (msg: any, error: any) => {
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#020617; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
      <h2 style="color:#DAA520;">ADMIN_SYSTEM_FAILURE</h2>
      <p style="opacity:0.7;">A critical bootstrap exception was caught by the Admin Terminal watchdog.</p>
      <pre style="background:#000; padding:15px; font-size:10px; color:#ff4444; border:1px solid #1e293b; border-radius:4px; text-align:left; overflow:auto; max-width:800px;">${msg}\n${error?.stack || ''}</pre>
      <button onclick="window.location.reload()" style="margin-top:30px; background:#DAA520; border:none; color:#000; padding:12px 30px; font-weight:900; cursor:pointer; border-radius:5px;">RELOAD TERMINAL</button>
    </div>`;
  }
};

(window as any).onerror = (msg: any, url: any, line: any, col: any, error: any) => handleError(msg, error);
(window as any).onunhandledrejection = (event: any) => handleError('Unhandled Promise Rejection: ' + (event.reason || 'Unknown'), event.reason);

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement as HTMLElement);

    // [STABILITY] Unregister Service Workers
    if ('serviceWorker' in navigator) {
        navigator.serviceWorker.getRegistrations().then((registrations) => {
            for (let registration of registrations) {
                registration.unregister();
                console.log('🛡️ [INIT] Purged Administrative Cache.');
            }
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
        console.error('[ADMIN-SYSTEM] Critical Mount Error:', err);
        handleError('Bootstrap Execution Fault', err);
    }
}
