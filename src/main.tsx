import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SovereignErrorBoundary from './components/SovereignErrorBoundary';
import { setupSovereignAlertInterceptor } from './components/SovereignAlertHandler';
import './admin-mobile-hardening.css';

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

function getStoredLanguage(): 'en' | 'ar' {
  const stored = localStorage.getItem('bin_language') || localStorage.getItem('language') || localStorage.getItem('lang');
  return stored === 'ar' ? 'ar' : 'en';
}

function applyLanguageRepair() {
  const lang = getStoredLanguage();
  const dir = lang === 'ar' ? 'rtl' : 'ltr';

  document.documentElement.lang = lang;
  document.documentElement.dir = dir;
  document.documentElement.setAttribute('data-language', lang);
  document.documentElement.setAttribute('data-direction', dir);
  document.body.dir = dir;
}

function applyGlobalScrollRepair() {
  const rootNode = document.getElementById('root');

  applyLanguageRepair();

  document.documentElement.style.minHeight = '100%';
  document.documentElement.style.height = 'auto';
  document.documentElement.style.overflowX = 'hidden';
  document.documentElement.style.overflowY = 'auto';
  document.documentElement.style.scrollBehavior = 'smooth';
  document.documentElement.style.touchAction = 'auto';

  document.body.style.minHeight = '100%';
  document.body.style.height = 'auto';
  document.body.style.margin = '0';
  document.body.style.overflowX = 'hidden';
  document.body.style.overflowY = 'auto';
  document.body.style.position = 'static';
  document.body.style.touchAction = 'auto';
  (document.body.style as any).webkitOverflowScrolling = 'touch';

  if (rootNode) {
    rootNode.style.minHeight = '100%';
    rootNode.style.height = 'auto';
    rootNode.style.overflowX = 'hidden';
    rootNode.style.overflowY = 'visible';
    rootNode.style.touchAction = 'auto';
  }
}

/**
 * [BOOT-SIGNAL]
 * Signals to the HTML-layer watchdog that React has successfully initialized.
 */
function BootSignal() {
  React.useEffect(() => {
    applyGlobalScrollRepair();

    const repairTimer = window.setInterval(applyGlobalScrollRepair, 1500);

    window.__BIN_GROUPS_BOOT__ = {
      ...(window.__BIN_GROUPS_BOOT__ || {}),
      reactMounted: true,
      mountedAt: Date.now(),
    };

    document.documentElement.setAttribute('data-bin-groups-react', 'mounted');

    const timeoutNode = document.getElementById('bin-groups-timeout');
    if (timeoutNode) {
      timeoutNode.style.display = 'none';
    }

    const loaderNode = document.getElementById('bin-boot-loader');
    if (loaderNode) {
      loaderNode.style.display = 'none';
    }

    window._BIN_MOUNT_SUCCESS?.();

    return () => window.clearInterval(repairTimer);
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
        applyGlobalScrollRepair();
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
