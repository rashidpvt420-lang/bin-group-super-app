import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

declare global {
  interface Window {
    __BIN_GROUPS_BOOT__?: {
      staticReady?: boolean;
      reactMounted?: boolean;
      authReady?: boolean;
      startedAt?: number;
      mountedAt?: number;
    };
    _BIN_MOUNT_SUCCESS?: () => void;
  }
}

/**
 * [BOOT-SIGNAL]
 * Signals to the HTML-layer watchdog that React has successfully initialized.
 */
function BootSignal() {
  React.useEffect(() => {
    window.__BIN_GROUPS_BOOT__ = {
      ...(window.__BIN_GROUPS_BOOT__ || {}),
      reactMounted: true,
      mountedAt: Date.now(),
    };

    document.documentElement.setAttribute("data-bin-groups-react", "mounted");

    const timeoutNode = document.getElementById("bin-groups-timeout");
    if (timeoutNode) {
      timeoutNode.style.display = "none";
    }

    const loaderNode = document.getElementById('bin-boot-loader');
    if (loaderNode) {
      loaderNode.style.display = 'none';
    }

    window._BIN_MOUNT_SUCCESS?.();
  }, []);

  return null;
}

// [STABILITY-PROTOCOL] Force Render if mount sequence stalls
const mountTimeout = setTimeout(() => {
    console.warn('[BIN-SYSTEM] Mount sequence exceeded 8s threshold. Recovering DOM...');
}, 8000);

window._BIN_MOUNT_SUCCESS = () => {
    clearTimeout(mountTimeout);
};

const handleError = (msg: any, url: any, line: any, col: any, error: any) => {
  console.error('[BIN-CRITICAL] Global System Crash:', { msg, url, line, col, error });
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="height:100vh; display:flex; flex-direction:column; align-items:center; justify-content:center; background:#000; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
      <div style="max-width:500px;">
        <h2 style="color:#C6A75E;">SYSTEM FATAL_ERROR</h2>
        <p style="color:#fff; opacity:0.7;">A critical bootstrap exception was caught by the Sovereign Watchdog.</p>
        <pre style="background:#111; padding:10px; font-size:10px; color:#ff4444; border-radius:4px; text-align:left; overflow:auto;">${msg}\n${error?.stack || ''}</pre>
        <button onclick="window.location.reload()" style="margin-top:30px; background:#C6A75E; border:none; color:#000; padding:12px 30px; font-weight:900; cursor:pointer; border-radius:5px;">RELOAD SYSTEM</button>
      </div>
    </div>`;
  }
};

(window as any).onerror = handleError;
(window as any).onunhandledrejection = (event: any) => handleError('Unhandled Promise Rejection: ' + (event.reason || 'Unknown'), '', 0, 0, null);

// 🏁 [BIN-METRICS] Start Performance Timer
const BOOT_START = Date.now();

const rootElement = document.getElementById('root');
if (rootElement) {
    const root = ReactDOM.createRoot(rootElement);

    // [STABILITY] Ensuring persistent PWA lifecycle for FCM Push Notifications

    try {
        root.render(
            <React.StrictMode>
                <BootSignal />
                <ErrorBoundary>
                    <App />
                </ErrorBoundary>
            </React.StrictMode>
        );
        // [BIN-SAFETY] Handshake successful if code reaches here
        window._BIN_MOUNT_SUCCESS?.();
        const bootTime = Date.now() - BOOT_START;
        console.log(`💎 [BOOT] Sovereign Core active in ${bootTime}ms`);
    } catch (err) {
        console.error('[BIN-SYSTEM] Critical Mount Error:', err);
        handleError('Bootstrap Execution Fault: ' + String(err), '', 0, 0, null);
    }
}
