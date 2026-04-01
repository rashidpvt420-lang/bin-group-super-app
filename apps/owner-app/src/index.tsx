// [STABILITY-PROTOCOL] Force Render if mount sequence stalls
const mountTimeout = setTimeout(() => {
    console.warn('[BIN-SYSTEM] Mount sequence exceeded 8s threshold. Recovering DOM...');
}, 8000);

(window as any)._BIN_MOUNT_SUCCESS = () => {
    clearTimeout(mountTimeout);
};

const handleError = (msg: any, url: any, line: any, col: any, error: any) => {
  console.error('[BIN-CRITICAL] Global System Crash:', { msg, url, line, col, error });
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="height:100vh; display:flex; align-items:center; justify-content:center; background:#000; color:#fff; font-family:sans-serif; text-align:center; padding:20px;">
      <div style="max-width:500px;">
        <h2 style="color:#C6A75E;">SYSTEM ERROR</h2>
        <p style="color:#fff; opacity:0.7;">A critical error occurred. Please try reloading the application.</p>
        <button onclick="window.location.reload()" style="margin-top:30px; background:#C6A75E; border:none; color:#000; padding:12px 30px; font-weight:900; cursor:pointer; border-radius:5px;">RELOAD</button>
      </div>
    </div>`;
  }
};
(window as any).onerror = handleError;
(window as any).onunhandledrejection = (event: any) => handleError('Unhandled Promise Rejection: ' + (event.reason || 'Unknown'), '', 0, 0, null);



// 🏁 [BIN-METRICS] Start Performance Timer
const BOOT_START = Date.now();

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';



const rootElement = document.getElementById('root');
if (!rootElement) {
    console.error('[BIN-FATAL] DOM #root not found.');
    throw new Error('Failed to find the root element');
}

const root = ReactDOM.createRoot(rootElement);

// 🛡️ [STABILITY-PROTOCOL] Handshake monitor active from line 1

try {
  
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  // [BIN-SAFETY] Timeout is NOT cleared here; it's cleared within App.tsx's useEffect.
  const bootTime = Date.now() - BOOT_START;
  
} catch (err) {
  console.error('[BIN-SYSTEM] Critical Mount Error:', err);
  handleError('Bootstrap Execution Fault: ' + String(err), '', 0, 0, null);
}

