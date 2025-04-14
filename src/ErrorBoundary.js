import React, { Component } from 'react';

/**
 * ErrorBoundary component to catch JavaScript errors anywhere in the application.
 * In production, displays a friendly error message.
 * In development, allows normal error display for debugging.
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    // In production, we could log the error to an error reporting service
    if (process.env.NODE_ENV === 'production') {
      // Example: logErrorToService(error, errorInfo);
      console.error('Application error:', error);
    }
  }

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p>We're sorry, but there was an error loading this page.</p>
          <button 
            onClick={() => window.location.reload()}
            className="refresh-button"
          >
            Refresh Page
          </button>
          {process.env.NODE_ENV !== 'production' && (
            <details style={{ whiteSpace: 'pre-wrap', marginTop: '20px' }}>
              <summary>Error Details</summary>
              {this.state.error && this.state.error.toString()}
            </details>
          )}
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary; 