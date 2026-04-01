// 🛡️ [BIN-SYSTEM] Atomic Stability Entry Point (ELEVATED)
const handleError = (msg: any, url: any, line: any, col: any, error: any) => {
  console.error('[BIN-CRITICAL] Global System Crash:', { msg, url, line, col, error });
  const root = document.getElementById('root');
  if (root) {
    root.innerHTML = `<div style="height:100vh; display:flex; align-items:center; justify-content:center; background:#000; color:#ff4d4d; font-family:sans-serif; text-align:center; padding:20px;">
      <div style="max-width:500px;">
        <h2 style="color:#C6A75E;">SYSTEM HANDSHAKE FAILURE</h2>
        <p style="color:#fff; opacity:0.7;">An institutional protocol error occurred during mounting.</p>
        <code style="background:rgba(255,255,255,0.1); padding:10px; border-radius:5px; font-size:12px; display:block; margin-top:20px; overflow-wrap:break-word;">${msg}</code>
        <button onclick="window.location.reload()" style="margin-top:30px; background:#C6A75E; border:none; color:#000; padding:12px 30px; font-weight:900; cursor:pointer; border-radius:5px;">RESTART CORE</button>
      </div>
    </div>`;
  }
};
(window as any).onerror = handleError;
(window as any).onunhandledrejection = (event: any) => handleError('Unhandled Promise Rejection: ' + (event.reason || 'Unknown'), '', 0, 0, null);

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

console.log('[BIN-SYSTEM] Sovereign OS Handshake starting...');

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Failed to find the root element');
const root = ReactDOM.createRoot(rootElement);

try {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log('[BIN-SYSTEM] Hydration successful.');
} catch (err) {
  console.error('[BIN-SYSTEM] Critical Mount Error:', err);
}
