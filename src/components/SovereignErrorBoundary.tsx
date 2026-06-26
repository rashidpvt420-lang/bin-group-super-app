import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { db, collection, addDoc, serverTimestamp, auth } from "../lib/firebase";
import "./ErrorBoundary.css";

// Simple Typography shim if not fully loaded
const Typography = ({ variant, sx, children }: any) => {
  const style = variant === 'caption' ? { fontSize: '0.75rem', ...sx } : { fontSize: '0.875rem', ...sx };
  return <div style={style as any}>{children}</div>;
};

const deleteIndexedDb = async () => {
  if (typeof indexedDB === 'undefined') return;

  const deleteByName = (name: string) => new Promise<void>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase(name);
      request.onsuccess = () => resolve();
      request.onerror = () => resolve();
      request.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });

  try {
    const databases = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : [];
    const names = databases
      .map((db) => db.name)
      .filter((name): name is string => Boolean(name))
      .filter((name) => /firebase|bin|firestore|fcm/i.test(name));

    await Promise.all(names.map(deleteByName));
  } catch {
    await Promise.all([
      deleteByName('firebaseLocalStorageDb'),
      deleteByName('firestore/[DEFAULT]/bin-group-57c60/main'),
    ]);
  }
};

export const resetBinClientState = async () => {
  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister().catch(() => undefined)));
    }
  } catch {
    // non-blocking reset path
  }

  try {
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key).catch(() => false)));
    }
  } catch {
    // non-blocking reset path
  }

  try {
    const preferredLanguage = localStorage.getItem('bin_language');
    localStorage.clear();
    sessionStorage.clear();
    if (preferredLanguage) localStorage.setItem('bin_language', preferredLanguage);
  } catch {
    // non-blocking reset path
  }

  await deleteIndexedDb();

  const target = `/login?intendedRole=admin&fresh=${Date.now()}`;
  window.location.replace(target);
};

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class SovereignErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public async componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("BIN-CRITICAL: Sovereign System Interruption detected.", error, errorInfo);
    
    const isChunkLoadError = 
      /failed to fetch/i.test(error.message || "") ||
      /dynamically imported module/i.test(error.message || "") ||
      /loading chunk/i.test(error.message || "") ||
      /chunk/i.test(error.message || "");

    if (isChunkLoadError) {
      try {
        const lastReload = sessionStorage.getItem('bin_chunk_reload_timestamp');
        const now = Date.now();
        if (!lastReload || now - parseInt(lastReload, 10) > 15000) {
          sessionStorage.setItem('bin_chunk_reload_timestamp', String(now));
          console.warn("Chunk load failure detected. Reloading page to fetch latest assets...");
          window.location.reload();
          return;
        }
      } catch (e) {
        console.error("Failed to auto-reload on chunk failure", e);
      }
    }
    
    try {
        await addDoc(collection(db, "telemetry_logs"), {
            severity: "CRITICAL",
            type: "FRONTEND_CRASH",
            message: error.message,
            stack: error.stack,
            componentStack: errorInfo.componentStack,
            userId: auth.currentUser?.uid || "UNAUTHENTICATED",
            userAgent: navigator.userAgent,
            url: window.location.href,
            timestamp: serverTimestamp()
        });
        console.log("Telemetry push complete. Incident sequestered.");
    } catch (telemetryErr) {
        console.warn("Telemetry Engine failed during crash reporting.", telemetryErr);
    }
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-fallback">
          <div className="error-boundary-tag">SOVEREIGN_FAILURE</div>
          <h1 className="error-boundary-title">System Interruption</h1>
          <p className="error-boundary-desc">
            A critical anomaly was detected in the frontend engine. BIN-GENESIS has sequestered the error and pushed telemetry to compliance.
          </p>
          
          <div style={{ 
            marginTop: '20px', 
            padding: '20px', 
            background: 'rgba(255,0,0,0.1)', 
            border: '1px solid rgba(255,0,0,0.2)',
            borderRadius: '8px',
            textAlign: 'left',
            maxWidth: '600px',
            margin: '20px auto'
          }}>
            <Typography variant="caption" sx={{ color: '#ff4444', fontWeight: 900, display: 'block', mb: 1 }}>ERROR_LOG:</Typography>
            <Typography variant="body2" sx={{ color: '#fff', opacity: 0.8, fontFamily: 'monospace', wordBreak: 'break-all' }}>
              {this.state.error?.message || "Unknown Runtime Execution Fault"}
            </Typography>
            {this.state.error?.stack && (
              <details style={{ marginTop: '10px' }}>
                <summary style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.4)', fontSize: '12px' }}>VIEW_STACK_TRACE</summary>
                <pre style={{ 
                  fontSize: '10px', 
                  color: 'rgba(255,255,255,0.3)', 
                  overflowX: 'auto',
                  marginTop: '10px',
                  maxHeight: '200px'
                }}>
                  {this.state.error.stack}
                </pre>
              </details>
            )}
          </div>

          <button 
            className="error-boundary-btn"
            onClick={() => void resetBinClientState()}
          >
            RESET SESSION & LOGIN
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SovereignErrorBoundary;
