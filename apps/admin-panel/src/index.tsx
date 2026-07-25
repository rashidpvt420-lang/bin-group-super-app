import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';

let reactMounted = false;
let bootErrorRendered = false;

const escapeHtml = (value: unknown) => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');

// Install bootstrap error handling before importing the application graph. A
// Firebase/App Check or route-module initialization error must never leave the
// static HTML loader on screen with no diagnosis.
const renderBootError = (message: unknown, error: unknown) => {
  if (reactMounted || bootErrorRendered) return;
  bootErrorRendered = true;
  const debugId = `ADMIN-BOOT-${Date.now().toString(36).toUpperCase()}`;
  console.error(`[${debugId}] Admin bootstrap error:`, message, error);
  const root = document.getElementById('root');
  if (!root) return;

  root.innerHTML = `<div data-testid="admin-bootstrap-error" style="height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#020617;color:#fff;font-family:sans-serif;text-align:center;padding:20px;box-sizing:border-box;">
    <h2 style="color:#DAA520;">Admin Console Could Not Start</h2>
    <p style="opacity:0.78;max-width:620px;">The secure Admin bundle loaded, but application initialization failed. Reload once. If the problem continues, contact BIN GROUP support with debug ID <strong>${escapeHtml(debugId)}</strong>.</p>
    <button onclick="window.location.reload()" style="margin-top:30px;background:#DAA520;border:none;color:#000;padding:12px 30px;font-weight:900;cursor:pointer;border-radius:5px;">RELOAD ADMIN</button>
  </div>`;
};

window.onerror = (message, _url, _line, _column, error) => {
  if (!reactMounted) renderBootError(message, error);
  else console.error('[ADMIN-RUNTIME] Window error after mount:', message, error);
  return false;
};

window.onunhandledrejection = (event) => {
  const reason = event?.reason || 'Unknown promise rejection';
  if (!reactMounted) renderBootError('Unhandled Promise Rejection', reason);
  else console.warn('[ADMIN-RUNTIME] Recoverable promise rejection after mount:', reason);
};

async function bootstrapAdmin() {
  try {
    const [appModule, boundaryModule, sharedModule] = await Promise.all([
      import('./App'),
      import('./components/ErrorBoundary'),
      import('@bin/shared'),
    ]);

    sharedModule.setupSovereignAlertInterceptor();

    const rootElement = document.getElementById('root');
    if (!rootElement) throw new Error('Admin root element is missing.');

    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.allSettled(registrations.map((registration) => registration.unregister()));
        if (registrations.length > 0) console.info('[ADMIN-INIT] Removed stale Admin service workers.');
      } catch (error) {
        console.warn('[ADMIN-INIT] Service worker cleanup skipped:', error);
      }
    }

    const App = appModule.default;
    const ErrorBoundary = boundaryModule.default;
    const root = ReactDOM.createRoot(rootElement);
    root.render(
      <React.StrictMode>
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      </React.StrictMode>,
    );
    reactMounted = true;
  } catch (error) {
    renderBootError('Bootstrap Execution Fault', error);
  }
}

void bootstrapAdmin();
