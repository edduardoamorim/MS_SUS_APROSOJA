import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

export default function Modal({ isOpen, onClose, title, children }: ModalProps) {
  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-card w-full max-w-lg rounded-2xl shadow-2xl border border-border p-6 relative animate-zoom-in m-4">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-bold text-foreground">{title}</h2>
          <button 
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-md transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div>
          {children}
        </div>
      </div>
    </div>,
    document.body
  );
}
