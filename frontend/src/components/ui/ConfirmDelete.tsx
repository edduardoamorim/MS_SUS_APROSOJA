import Modal from './Modal';
import { AlertTriangle, Trash2 } from 'lucide-react';

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
      <div className="flex flex-col items-center text-center space-y-4 py-2">
        <div className="w-14 h-14 rounded-3xl bg-red-50 text-red-600 border border-red-200 flex items-center justify-center animate-bounce duration-1000">
          <AlertTriangle className="w-7 h-7" />
        </div>
        <p className="text-slate-600 text-sm font-medium max-w-sm">{description}</p>
      </div>

      <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
        <button 
          onClick={onClose}
          className="px-5 py-2.5 rounded-2xl font-extrabold text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer"
        >
          Cancelar
        </button>
        <button 
          onClick={() => {
            onConfirm();
            onClose();
          }}
          className="group relative flex items-center gap-2 px-5 py-2.5 rounded-2xl font-extrabold text-xs bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 text-white shadow-md shadow-red-600/20 hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 cursor-pointer overflow-hidden"
        >
          <span className="absolute inset-0 w-full h-full bg-white/20 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 ease-out pointer-events-none" />
          <Trash2 className="w-4 h-4 transition-transform group-hover:scale-110 duration-300" />
          <span>Excluir Definitivamente</span>
        </button>
      </div>
    </Modal>
  );
}
