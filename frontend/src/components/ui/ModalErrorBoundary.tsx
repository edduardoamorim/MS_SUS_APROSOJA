import { Component, type ErrorInfo, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, RefreshCw, X } from 'lucide-react';

interface Props {
  children: ReactNode;
  onClose?: () => void;
  title?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ModalErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ModalErrorBoundary capturou um erro:', error, errorInfo);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  private handleClose = () => {
    this.setState({ hasError: false, error: null });
    this.props.onClose?.();
  };

  public render() {
    if (this.state.hasError) {
      return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-amber-700 px-6 py-4 flex items-center justify-between text-white">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-white/15 rounded-xl backdrop-blur-sm">
                  <AlertTriangle className="w-5 h-5 text-amber-300" />
                </div>
                <div>
                  <h3 className="font-semibold text-base leading-tight">
                    {this.props.title || 'Atenção'}
                  </h3>
                  <p className="text-xs text-emerald-100/90">
                    Proteção de Interface Ativa
                  </p>
                </div>
              </div>
              {this.props.onClose && (
                <button
                  onClick={this.handleClose}
                  className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors"
                  title="Fechar"
                >
                  <X className="w-5 h-5" />
                </button>
              )}
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-700 leading-relaxed font-medium">
                Ocorreu um imprevisto ao exibir esta janela. Seus dados do painel continuam seguros.
              </p>

              {this.state.error?.message && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-xs font-mono text-slate-600 break-words max-h-32 overflow-y-auto">
                  {this.state.error.message}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-center justify-end gap-2.5 pt-2">
                <button
                  onClick={this.handleRetry}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-colors"
                >
                  <RefreshCw className="w-4 h-4" />
                  Tentar Novamente
                </button>
                <button
                  onClick={this.handleClose}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-emerald-700 hover:bg-emerald-800 shadow-sm transition-colors"
                >
                  Fechar e Voltar ao Painel
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      );
    }

    return this.props.children;
  }
}

export default ModalErrorBoundary;
