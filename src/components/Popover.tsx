"use client";
import { useEffect, useRef, useCallback, ReactNode } from 'react';

interface PopoverProps {
  isOpen: boolean;
  onClose: () => void;
  children: ReactNode;
  anchorEl?: HTMLElement | null;
  placement?: 'bottom' | 'top' | 'left' | 'right';
  offset?: number;
  className?: string;
}

export default function Popover({ 
  isOpen, 
  onClose, 
  children, 
  anchorEl, 
  placement = 'bottom',
  offset = 8,
  className = '' 
}: PopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const previouslyFocused = useRef<Element | null>(null);

  // Position popover relative to anchor
  const updatePosition = useCallback(() => {
    if (!isOpen || !popoverRef.current || !anchorEl) return;

    const popover = popoverRef.current;
    const anchor = anchorEl.getBoundingClientRect();
    const viewport = {
      width: window.innerWidth,
      height: window.innerHeight
    };

    let top = 0;
    let left = 0;

    switch (placement) {
      case 'bottom':
        top = anchor.bottom + offset;
        left = anchor.left;
        break;
      case 'top':
        top = anchor.top - offset;
        left = anchor.left;
        break;
      case 'right':
        top = anchor.top;
        left = anchor.right + offset;
        break;
      case 'left':
        top = anchor.top;
        left = anchor.left - offset;
        break;
    }

    // Adjust for viewport boundaries
    const popoverRect = popover.getBoundingClientRect();
    
    // Horizontal adjustment
    if (left + popoverRect.width > viewport.width) {
      left = viewport.width - popoverRect.width - 16; // 16px margin
    }
    if (left < 16) {
      left = 16;
    }

    // Vertical adjustment
    if (top + popoverRect.height > viewport.height) {
      if (placement === 'bottom') {
        top = anchor.top - popoverRect.height - offset;
      } else {
        top = viewport.height - popoverRect.height - 16;
      }
    }
    if (top < 16) {
      top = 16;
    }

    popover.style.top = `${top}px`;
    popover.style.left = `${left}px`;
  }, [isOpen, anchorEl, placement, offset]);

  // Handle clicks outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        popoverRef.current && 
        !popoverRef.current.contains(target) && 
        anchorEl && 
        !anchorEl.contains(target)
      ) {
        onClose();
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, onClose, anchorEl]);

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
      
      // Focus first focusable element
      setTimeout(() => {
        const focusable = popoverRef.current?.querySelector<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        );
        focusable?.focus();
      }, 0);

      return () => {
        document.removeEventListener('keydown', handleEscape);
        if (previouslyFocused.current instanceof HTMLElement) {
          previouslyFocused.current.focus();
        }
      };
    }
  }, [isOpen, onClose]);

  // Update position when opened or window resized
  useEffect(() => {
    if (isOpen) {
      updatePosition();
      
      const handleResize = () => updatePosition();
      const handleScroll = () => onClose(); // Close on scroll for simplicity
      
      window.addEventListener('resize', handleResize);
      window.addEventListener('scroll', handleScroll, true);
      
      return () => {
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('scroll', handleScroll, true);
      };
    }
  }, [isOpen, updatePosition, onClose]);

  if (!isOpen) return null;

  return (
    <>
      {/* Invisible backdrop for mobile */}
      <div 
        className="fixed inset-0 z-40 sm:hidden" 
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Popover */}
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        className={`
          fixed z-50 bg-white rounded-lg shadow-xl border
          transform-gpu transition-all duration-200 ease-out
          ${isOpen ? 'scale-100 opacity-100' : 'scale-95 opacity-0'}
          ${className}
        `}
        style={{
          transformOrigin: placement === 'bottom' ? 'top' : 'bottom'
        }}
      >
        {children}
      </div>

      {/* Styling for dark theme */}
      <style jsx>{`
        [data-theme="dark"] .bg-white {
          background-color: var(--layer-surface);
          border-color: var(--border-soft);
        }
      `}</style>
    </>
  );
}
