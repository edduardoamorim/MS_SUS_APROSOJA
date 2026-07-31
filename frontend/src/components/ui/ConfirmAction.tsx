import Modal from './Modal';
import { AlertCircle, CheckCircle2, HelpCircle } from 'lucide-react';

export type ActionType = 'danger' | 'success' | 'warning' | 'info';

interface ConfirmActionProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  actionType?: ActionType;
}

export default function ConfirmAction({ 
  isOpen, 
  onClose, 
  onConfirm, 
  title, 
  description,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  actionType = "warning"
}: ConfirmActionProps) {

  const getStyles = () => {
    switch (actionType) {
      case 'danger':
        return {
          bg: 'bg-red-50 text-red-600 border border-red-200',
          icon: <AlertCircle className="w-7 h-7" />,
          button: 'bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-600/20'
        };
      case 'success':
        return {
          bg: 'bg-emerald-50 text-[#1B7547] border border-emerald-200',
          icon: <CheckCircle2 className="w-7 h-7" />,
          button: 'bg-gradient-to-r from-[#1B7547] to-[#15613a] hover:from-[#15613a] hover:to-[#0B3B23] text-white shadow-md shadow-[#1B7547]/20'
        };
      case 'info':
        return {
          bg: 'bg-blue-50 text-blue-700 border border-blue-200',
          icon: <HelpCircle className="w-7 h-7" />,
          button: 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-md shadow-blue-600/20'
        };
      case 'warning':
      default:
        return {
          bg: 'bg-amber-50 text-amber-800 border border-amber-200',
          icon: <AlertCircle className="w-7 h-7" />,
          button: 'bg-gradient-to-r from-[#C59B27] to-amber-700 hover:from-amber-700 hover:to-amber-800 text-white shadow-md shadow-amber-600/20'
        };
    }
  };

  const styles = getStyles();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center text-center space-y-4 py-2">
        <div className={`w-14 h-14 rounded-3xl ${styles.bg} flex items-center justify-center animate-bounce duration-1000`}>
          {styles.icon}
        </div>
        <p className="text-slate-600 text-sm font-medium max-w-sm">{description}</p>
      </div>
      
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
        <button 
          onClick={onClose}
          className="px-5 py-2.5 rounded-2xl font-extrabold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
        >
          {cancelText}
        </button>
        <button 
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`group relative px-5 py-2.5 rounded-2xl font-extrabold text-xs hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden ${styles.button}`}
        >
          <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
          <span>{confirmText}</span>
        </button>
      </div>
    </Modal>
  );
}
