import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

function ErrorFallback({ error, onReset }) {
  return (
    <div className="flex items-center justify-center min-h-[400px] p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle size={28} className="text-red-500" />
        </div>
        <h2 className="text-xl font-black text-gray-800 mb-2">Something went wrong</h2>
        <p className="text-sm text-gray-500 mb-6 leading-relaxed">
          This section encountered an error. Your data is safe — click below to reload this panel.
        </p>
        {error && (
          <details className="mb-4 text-left">
            <summary className="text-xs text-gray-400 cursor-pointer hover:text-gray-600 mb-1">Technical details</summary>
            <pre className="text-[10px] text-red-600 bg-red-50 rounded-lg p-3 overflow-auto max-h-32 whitespace-pre-wrap">
              {error.message || String(error)}
            </pre>
          </details>
        )}
        <button
          onClick={onReset}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all"
          style={{ background: 'var(--brand-accent)' }}
        >
          <RotateCcw size={14} />
          Try Again
        </button>
      </div>
    </div>
  );
}

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] Caught error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <ErrorFallback
          error={this.state.error}
          onReset={() => this.setState({ hasError: false, error: null })}
        />
      );
    }
    return this.props.children;
  }
}
