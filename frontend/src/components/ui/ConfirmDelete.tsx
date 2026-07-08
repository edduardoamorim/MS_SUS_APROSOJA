import Modal from './Modal';
import { AlertTriangle } from 'lucide-react';

interface ConfirmDeleteProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
}

export default function ConfirmDelete({ isOpen, onClose, onConfirm, title, description }: ConfirmDeleteProps) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title}>
      <div className="flex flex-col items-center text-center space-y-4 pb-4">
        <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center animate-soft-pulse">
          <AlertTriangle className="w-6 h-6 text-destructive" />
        </div>
        <p className="text-muted-foreground">{description}</p>
      </div>
      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-border">
        <button 
          onClick={onClose}
          className="px-4 py-2 font-medium text-sm rounded-md bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-all active:scale-95 hover:-translate-y-0.5 cursor-pointer"
        >
          Cancelar
        </button>
        <button 
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="px-4 py-2 font-medium text-sm rounded-md bg-destructive text-destructive-foreground hover:bg-destructive/90 transition-all shadow-sm active:scale-95 hover:-translate-y-0.5 cursor-pointer"
        >
          Excluir Definitivamente
        </button>
      </div>
    </Modal>
  );
}
