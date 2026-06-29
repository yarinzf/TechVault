import { Component } from 'react';
import { AlertTriangle } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    if (import.meta.env.DEV) {
      console.error('[ErrorBoundary]', error, info.componentStack);
    }
  }

  handleReset = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="flex items-center justify-center min-h-[60vh] p-8" dir="rtl">
        <div className="bg-card border border-white/[0.06] rounded-xl p-8 max-w-md w-full text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-red-400" aria-hidden="true" />
          </div>
          <h2 className="text-lg font-semibold text-foreground">
            {this.props.title || 'משהו השתבש'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {this.props.message || 'אירעה שגיאה בלתי צפויה. נסה לרענן את הדף.'}
          </p>
          <div className="flex gap-3 justify-center pt-2">
            <button
              onClick={this.handleReset}
              className="px-4 py-2 text-sm rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
            >
              נסה שוב
            </button>
            <button
              onClick={() => { this.setState({ hasError: false }); window.location.assign('/'); }}
              className="px-4 py-2 text-sm rounded-lg bg-secondary/50 hover:bg-secondary text-foreground transition-colors"
            >
              דף הבית
            </button>
          </div>
        </div>
      </div>
    );
  }
}
