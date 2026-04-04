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

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error at React root:", error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary-container">
          <div className="error-boundary-content">
            <h1 className="error-boundary-header">RENDER_CRITICAL_FAILURE</h1>
            <p className="error-boundary-text">
              The application crashed during the UI rendering cycle.
            </p>
            <div className="error-boundary-stack">
              {this.state.error?.message}<br/>
              {this.state.error?.stack}
            </div>
            <button onClick={() => window.location.reload()} className="error-boundary-button">
              RELOAD SYSTEM
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
