import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SovereignErrorBoundary from './components/SovereignErrorBoundary';
import { setupSovereignAlertInterceptor } from '@bin/shared';

setupSovereignAlertInterceptor();

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

// 🏁 [BIN-METRICS] Start Performance Timer
const BOOT_START = Date.now();

const mountApp = () => {
    const rootElement = document.getElementById('root');

    if (!rootElement) {
        console.error('[BIN-SYSTEM] Critical Mount Error: #root element missing from DOM.');
        return;
    }

    try {
        const root = ReactDOM.createRoot(rootElement);
        root.render(
            <React.StrictMode>
                <BootSignal />
                <SovereignErrorBoundary>
                    <App />
                </SovereignErrorBoundary>
            </React.StrictMode>
        );
        const bootTime = Date.now() - BOOT_START;
        console.log(`💎 [BOOT] Sovereign Core active in ${bootTime}ms`);
    } catch (err) {
        console.error('[BIN-SYSTEM] Critical Mount Error:', err);
    }
};

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountApp, { once: true });
} else {
    mountApp();
}
