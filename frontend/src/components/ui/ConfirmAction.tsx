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
          bg: 'bg-destructive/10',
          icon: <AlertCircle className="w-6 h-6 text-destructive" />,
          button: 'bg-destructive text-destructive-foreground hover:bg-destructive/90'
        };
      case 'success':
        return {
          bg: 'bg-emerald-100',
          icon: <CheckCircle2 className="w-6 h-6 text-emerald-600" />,
          button: 'bg-emerald-600 text-white hover:bg-emerald-700'
        };
      case 'info':
        return {
          bg: 'bg-blue-100',
          icon: <HelpCircle className="w-6 h-6 text-blue-600" />,
          button: 'bg-blue-600 text-white hover:bg-blue-700'
        };
      case 'warning':
      default:
        return {
          bg: 'bg-amber-100',
          icon: <AlertCircle className="w-6 h-6 text-amber-600" />,
          button: 'bg-amber-600 text-white hover:bg-amber-700'
        };
    }
  };

  const styles = getStyles();

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center text-center space-y-4 pb-4">
        <div className={`w-12 h-12 rounded-full ${styles.bg} flex items-center justify-center animate-soft-pulse`}>
          {styles.icon}
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
        <button 
          onClick={onClose}
          className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all active:scale-95 hover:-translate-y-0.5 cursor-pointer"
        >
          {cancelText}
        </button>
        <button 
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className={`px-4 py-2 font-medium text-sm rounded-md transition-all shadow-sm active:scale-95 hover:-translate-y-0.5 cursor-pointer ${styles.button}`}
        >
          {confirmText}
        </button>
      </div>
    </Modal>
  );
}
