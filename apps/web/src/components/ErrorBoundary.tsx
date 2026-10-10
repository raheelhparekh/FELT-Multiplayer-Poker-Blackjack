import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error in component tree:", error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleHome = () => {
    window.location.href = "/";
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#07130a] flex flex-col items-center justify-center p-6 text-emerald-100 text-center select-none">
          <div className="w-16 h-16 rounded-2xl bg-gold-500/10 border border-gold-500/30 flex items-center justify-center mb-4 text-3xl shadow-lg">
            🃏
          </div>
          <h2 className="text-xl font-bold tracking-wide text-gold-300 mb-2">
            Table State Desynchronized
          </h2>
          <p className="text-xs text-emerald-400/80 max-w-md mb-6 leading-relaxed">
            The table interface encountered a temporary synchronization glitch. Reconnecting will
            restore your cards, stack, and active game session.
          </p>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="px-5 py-2.5 rounded-xl bg-gold-500 hover:bg-gold-400 text-black font-bold text-sm shadow-md transition-all active:scale-95"
            >
              Reconnect Table
            </button>
            <button
              type="button"
              onClick={this.handleHome}
              className="px-5 py-2.5 rounded-xl bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-200 text-sm font-semibold transition-all active:scale-95"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
