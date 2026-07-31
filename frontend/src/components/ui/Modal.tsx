import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  maxWidth?: string;
}

export default function Modal({ isOpen, onClose, title, children, maxWidth = "max-w-lg" }: ModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div 
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-md animate-fade-in p-4 overflow-y-auto cursor-pointer"
    >
      <div 
        onClick={e => e.stopPropagation()}
        className={`bg-white w-full ${maxWidth} rounded-3xl shadow-2xl border border-slate-200 p-6 sm:p-8 relative animate-zoom-in my-auto max-h-[92vh] overflow-y-auto cursor-default`}
      >
        {title ? (
          <div className="flex justify-between items-center mb-6 pb-3 border-b border-slate-100">
            <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">{title}</h2>
            <button 
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 bg-slate-100 hover:bg-slate-200 p-2.5 rounded-full transition-all duration-300 hover:scale-110 hover:rotate-90 active:scale-90 cursor-pointer"
              title="Fechar"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : null}
        <div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
