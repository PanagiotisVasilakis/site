"use client";
import { useEffect } from 'react';

interface MobileModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

export default function MobileModal({ 
  isOpen, 
  onClose, 
  title, 
  children, 
  className = '' 
}: MobileModalProps) {
  
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 lg:hidden"
      role="dialog" 
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div className="relative h-full flex flex-col">
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="px-4 py-3 border-b border-[color:var(--border-soft)] flex items-center justify-between bg-[color:var(--layer-surface)]">
            <h2 id="modal-title" className="text-lg font-semibold text-[color:var(--fg-default)]">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="p-2 -mr-2 text-[color:var(--fg-muted)] hover:text-[color:var(--fg-default)] transition-colors"
              aria-label="Close modal"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          {/* Content */}
          <div className={`flex-1 overflow-y-auto bg-[color:var(--layer-surface)] ${className}`}>
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
