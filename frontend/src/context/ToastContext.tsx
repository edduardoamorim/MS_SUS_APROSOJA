import React, { createContext, useContext, useState, useCallback } from 'react';
import { X, CheckCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

const ToastItem: React.FC<{ toast: Toast; onClose: () => void }> = ({ toast, onClose }) => {
  const { type, message, duration = 4000 } = toast;

  // Define styles based on type
  let bgClass = 'bg-card border-slate-200';
  let textClass = 'text-slate-800 dark:text-slate-200';
  let iconColor = 'text-blue-500';
  let Icon = Info;
  let progressBg = 'bg-blue-500';

  if (type === 'success') {
    bgClass = 'bg-emerald-50 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50';
    textClass = 'text-emerald-900 dark:text-emerald-200';
    iconColor = 'text-emerald-600 dark:text-emerald-400';
    Icon = CheckCircle;
    progressBg = 'bg-emerald-500';
  } else if (type === 'error') {
    bgClass = 'bg-rose-50 border-rose-200 dark:bg-rose-950/30 dark:border-rose-900/50';
    textClass = 'text-rose-900 dark:text-rose-200';
    iconColor = 'text-rose-600 dark:text-rose-400';
    Icon = AlertCircle;
    progressBg = 'bg-rose-500';
  } else if (type === 'warning') {
    bgClass = 'bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-900/50';
    textClass = 'text-amber-900 dark:text-amber-200';
    iconColor = 'text-amber-600 dark:text-amber-400';
    Icon = AlertTriangle;
    progressBg = 'bg-amber-500';
  } else if (type === 'info') {
    bgClass = 'bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-900/50';
    textClass = 'text-blue-900 dark:text-blue-200';
    iconColor = 'text-blue-600 dark:text-blue-400';
    Icon = Info;
    progressBg = 'bg-blue-500';
  }

  return (
    <div
      className={`pointer-events-auto flex w-full relative overflow-hidden rounded-xl border p-4 shadow-lg backdrop-blur-md transition-all duration-300 animate-slide-in ${bgClass}`}
      role="alert"
    >
      <div className="flex gap-3 items-start w-full">
        <Icon className={`w-5 h-5 shrink-0 ${iconColor} mt-0.5`} />
        <div className={`flex-1 text-sm font-medium leading-5 whitespace-pre-line text-left ${textClass}`}>
          {message}
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg p-0.5 transition-colors focus:outline-none shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      
      {/* Animated timer progress bar */}
      <div className="absolute bottom-0 left-0 right-0 h-1 bg-slate-100/50 dark:bg-slate-800/30">
        <div
          className={`h-full ${progressBg} animate-progress`}
          style={{ animationDuration: `${duration}ms` }}
        />
      </div>
    </div>
  );
};

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'info', duration = 4000) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type, duration }]);
    
    setTimeout(() => {
      removeToast(id);
    }, duration);
  }, [removeToast]);

  const success = useCallback((message: string, duration?: number) => showToast(message, 'success', duration), [showToast]);
  const error = useCallback((message: string, duration?: number) => showToast(message, 'error', duration), [showToast]);
  const warning = useCallback((message: string, duration?: number) => showToast(message, 'warning', duration), [showToast]);
  const info = useCallback((message: string, duration?: number) => showToast(message, 'info', duration), [showToast]);

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      {children}
      {/* Toast container on top-right */}
      <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-md w-full pointer-events-none px-4 sm:px-0">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};
