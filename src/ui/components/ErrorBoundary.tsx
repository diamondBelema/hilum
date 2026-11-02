// src/ui/components/ErrorBoundary.tsx
import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from './Button';

interface Props {
  children: ReactNode;
  moduleName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error(`Uncaught error in module [${this.props.moduleName || 'UI'}]:`, error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center p-6 rounded-xl border border-destructive/30 bg-destructive/5 text-center space-y-4 my-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold text-destructive">
              {this.props.moduleName ? `${this.props.moduleName} encountered an error` : 'Component Rendering Failed'}
            </h3>
            <p className="text-xs text-muted-foreground max-w-md">
              {this.state.error?.message || 'An unexpected error occurred while rendering this module.'}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={this.handleReset}>
            Reload Module
          </Button>
        </div>
      );
    }

    return this.props.children;
  }
}
