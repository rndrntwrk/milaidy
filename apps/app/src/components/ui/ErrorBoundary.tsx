import { Component, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    return (
      <div className="flex min-h-40 items-center justify-center p-6">
        <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
          <h2 className="mb-2 text-lg font-semibold text-txt">
            Something went wrong
          </h2>
          <p className="mb-4 truncate text-sm text-muted">
            {this.state.error?.message ?? "An unexpected error occurred"}
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-fg transition-opacity hover:opacity-80"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
