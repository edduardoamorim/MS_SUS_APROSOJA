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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs animate-fade-in p-4 overflow-y-auto cursor-pointer"
    >
      <div 
        onClick={e => e.stopPropagation()}
        className={`bg-card w-full ${maxWidth} rounded-2xl shadow-2xl border border-border p-6 relative animate-zoom-in my-auto max-h-[90vh] overflow-y-auto cursor-default`}
      >
        {title ? (
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <button 
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground hover:bg-muted p-1.5 rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
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
