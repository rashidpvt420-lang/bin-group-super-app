
import React, { Component, ErrorInfo, ReactNode } from "react";
import "./ErrorBoundary.css";

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
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
        <div className="error-boundary-fallback" style={{ 
            height: '100vh', 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            background: '#0B0B0C',
            color: '#FFF',
            fontFamily: 'Inter, sans-serif',
            textAlign: 'center',
            padding: '2rem'
        }}>
          <div style={{ color: '#C6A75E', fontSize: '12px', fontWeight: 900, letterSpacing: '8px', marginBottom: '24px' }}>SOVEREIGN_FAILURE</div>
          <h1 style={{ fontSize: '3rem', fontWeight: 950, marginBottom: '16px', letterSpacing: '-2px' }}>System Interruption</h1>
          <p style={{ color: 'rgba(255,255,255,0.6)', maxWidth: '500px', lineHeight: 1.6, marginBottom: '40px' }}>
            A critical anomaly was detected in the frontend engine. BIN-GENESIS has sequestered the error and pushed telemetry to compliance.
          </p>
          <button 
            onClick={() => window.location.assign('/')}
            style={{ 
                background: '#C6A75E', 
                color: '#000', 
                border: 'none', 
                padding: '16px 48px', 
                borderRadius: '100px', 
                fontWeight: 900, 
                cursor: 'pointer' 
            }}
          >
            REBOOT SYSTEM
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
