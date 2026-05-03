import React, { Component, ErrorInfo, ReactNode } from "react";
import "./ErrorBoundary.css";

// Simple Typography shim if not fully loaded
const Typography = ({ variant, sx, children }: any) => {
  const style = variant === 'caption' ? { fontSize: '0.75rem', ...sx } : { fontSize: '0.875rem', ...sx };
  return <div style={style as any}>{children}</div>;
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
    
    try {
        const { db, collection, addDoc, serverTimestamp } = await import("../lib/firebase");
        const auth = (await import("../lib/firebase")).auth;
        
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
            onClick={() => window.location.assign('/')}
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default SovereignErrorBoundary;
