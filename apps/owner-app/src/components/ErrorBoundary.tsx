
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
        <div className="error-boundary-fallback">
          <div className="error-boundary-tag">SOVEREIGN_FAILURE</div>
          <h1 className="error-boundary-title">System Interruption</h1>
          <p className="error-boundary-desc">
            A critical anomaly was detected in the frontend engine. BIN-GENESIS has sequestered the error and pushed telemetry to compliance.
          </p>
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

export default ErrorBoundary;
