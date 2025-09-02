"use client";
import { useEffect, useRef, useCallback, ReactNode } from 'react';

interface BottomSheetProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  title?: string;
  maxHeight?: string;
  className?: string;
}

export default function BottomSheet({ isOpen, onClose, children, title, maxHeight = '80vh', className = '' }: BottomSheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);
  const startY = useRef<number>(0);
  const currentY = useRef<number>(0);
  const isDragging = useRef<boolean>(false);

  // Handle escape key and focus management
  useEffect(() => {
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    }

    if (isOpen) {
      previouslyFocused.current = document.activeElement;
      document.addEventListener('keydown', handleEscape);
      
      // Focus trap
      setTimeout(() => {
        const focusable = sheetRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }, 100);

      // Prevent background scroll
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';

      return () => {
        document.removeEventListener('keydown', handleEscape);
        document.body.style.overflow = originalOverflow;
        if (previouslyFocused.current instanceof HTMLElement) {
          previouslyFocused.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  // Touch handlers for swipe down to close
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      startY.current = e.touches[0].clientY;
      currentY.current = startY.current;
      isDragging.current = true;
      
      if (sheetRef.current) {
        sheetRef.current.style.transition = 'none';
      }
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging.current || e.touches.length !== 1) return;
    
    currentY.current = e.touches[0].clientY;
    const deltaY = Math.max(0, currentY.current - startY.current);
    
    if (sheetRef.current && deltaY > 0) {
      const progress = Math.min(deltaY / 200, 1); // 200px to trigger close
      sheetRef.current.style.transform = `translateY(${deltaY}px)`;
      
      if (overlayRef.current) {
        overlayRef.current.style.opacity = String(1 - progress * 0.5);
      }
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging.current) return;
    
    const deltaY = currentY.current - startY.current;
    const shouldClose = deltaY > 100; // Close if dragged down more than 100px
    
    if (sheetRef.current) {
      sheetRef.current.style.transition = 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)';
      
      if (shouldClose) {
        sheetRef.current.style.transform = 'translateY(100%)';
        setTimeout(onClose, 300);
      } else {
        sheetRef.current.style.transform = 'translateY(0)';
      }
    }
    
    if (overlayRef.current) {
      overlayRef.current.style.opacity = shouldClose ? '0' : '1';
    }
    
    isDragging.current = false;
  }, [onClose]);

  // Handle overlay click
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === overlayRef.current) {
      onClose();
    }
  }, [onClose]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50" 
      role="presentation"
    >
      {/* Overlay */}
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/40 transition-opacity duration-300"
        style={{ opacity: isOpen ? 1 : 0 }}
        onClick={handleOverlayClick}
        aria-hidden="true"
      />
      
      {/* Bottom Sheet */}
      <div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Dialog'}
        className={`
          absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl
          transform transition-transform duration-300 ease-out
          ${isOpen ? 'translate-y-0' : 'translate-y-full'}
          ${className}
        `}
        style={{ 
          maxHeight,
          transform: isOpen ? 'translateY(0)' : 'translateY(100%)'
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Handle */}
        <div className="flex justify-center py-3">
          <div 
            className="w-12 h-1 bg-gray-300 rounded-full cursor-pointer"
            aria-label="Drag to close"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClose();
              }
            }}
          />
        </div>

        {/* Header */}
        {title && (
          <div className="flex items-center justify-between px-6 pb-4">
            <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-gray-600 rounded-full hover:bg-gray-100 transition-colors"
              aria-label="Close"
            >
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        )}

        {/* Content */}
        <div className="px-6 pb-6 overflow-y-auto" style={{ maxHeight: 'calc(80vh - 120px)' }}>
          {children}
        </div>
      </div>

      {/* Dark theme support */}
      <style jsx>{`
        [data-theme="dark"] .bg-white {
          background-color: var(--layer-surface);
        }
        [data-theme="dark"] .text-gray-900 {
          color: var(--fg-default);
        }
        [data-theme="dark"] .text-gray-400 {
          color: var(--fg-muted);
        }
        [data-theme="dark"] .hover\\:bg-gray-100:hover {
          background-color: var(--layer-surface-alt);
        }
      `}</style>
    </div>
  );
}
