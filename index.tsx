import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-4 font-sans">
            <div className="bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-lg border border-red-400 dark:border-red-600 max-w-lg text-center">
                <h1 className="text-2xl font-bold text-red-700 dark:text-red-300 mb-4">Application Error</h1>
                <p className="text-gray-600 dark:text-gray-400 mb-6">Something went wrong and the application could not start. This is often caused by a missing API key.</p>
                <div className="bg-red-100 dark:bg-red-900/30 p-4 rounded-lg text-left">
                    <p className="font-mono text-sm text-red-700 dark:text-red-300 break-all">
                        <strong>Error:</strong> {this.state.error?.message}
                    </p>
                </div>
                 {/* Fix: Updated environment variable name to API_KEY to match guidelines. */}
                 <p className="text-xs text-gray-500 dark:text-gray-400 mt-6">Please check your Vercel environment variables and ensure <strong>API_KEY</strong> is set correctly, then redeploy the application.</p>
            </div>
        </div>
      );
    }

    return this.props.children;
  }
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);