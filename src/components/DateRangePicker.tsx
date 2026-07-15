"use client";
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { DayPicker, type DateRange as RDPDateRange } from 'react-day-picker';
import {
  DateRange,
  getBlockedDates,
  validateDateRange
} from '@/lib/dateUtils';
import { logger } from '@/lib/logger-client';
import { getDictionary } from '@/i18n/dictionaries';
import type { Locale } from '@/i18n/config';

// Import styles
import 'react-day-picker/dist/style.css';

// Constants
const MOBILE_BREAKPOINT = 768;
const COMPACT_BREAKPOINT = 640;

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  onClose?: () => void;
  isOpen?: boolean;
  activeField?: 'arrival' | 'departure' | null;
  locale?: string;
  anchor?: {
    left: number;
    width: number;
    containerWidth: number;
  };
}

export default function DateRangePicker({
  value,
  onChange,
  onClose,
  isOpen = false,
  activeField = null,
  locale = 'en',
  anchor
}: DateRangePickerProps) {
  const t = getDictionary(locale as Locale);
  const dp = t.datePicker;
  const [selectedRange, setSelectedRange] = useState<DateRange>(value || { from: undefined, to: undefined });
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isMobile, setIsMobile] = useState(false);
  const [isCompact, setIsCompact] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const restoreFocusRef = useRef(false);

  // Check if mobile on mount
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      setIsMobile(w < MOBILE_BREAKPOINT);
      setIsCompact(w < COMPACT_BREAKPOINT);
    };
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  // Sync with external value
  useEffect(() => {
    if (value) {
      setSelectedRange(value);
    }
  }, [value]);

  useEffect(() => {
    if (!value) return;
    if (activeField === 'arrival' && value.from) {
      setCurrentMonth(value.from);
    } else if (activeField === 'departure' && value.to) {
      setCurrentMonth(value.to);
    }
  }, [activeField, value]);

  // Get blocked dates
  const blockedDates = useMemo(() => getBlockedDates(), []);

  // Disable past dates and blocked dates
  const disabledDays = useMemo(() => [
    { before: new Date() },
    ...blockedDates
  ], [blockedDates]);

  // Handle date selection - convert from RDP type to our type
  const handleDateSelect = useCallback((range: RDPDateRange | undefined) => {
    logger.debug('Date selected', { range });

    if (!range) {
      setSelectedRange({ from: undefined, to: undefined });
      return;
    }

    const newRange = {
      from: range.from,
      to: range.to
    };

    setSelectedRange(newRange);

    // Immediately notify parent of change
    onChange?.(newRange);

    // Auto-close when both dates are selected (after a brief delay for visual feedback)
    if (range.from && range.to) {
      setTimeout(() => {
        restoreFocusRef.current = true;
        onClose?.();
      }, 500);
    }
  }, [onChange, onClose]);

  // Apply selection
  const handleApply = useCallback(() => {
    const validation = validateDateRange(selectedRange, locale === 'el' ? 'el' : 'en');
    if (!validation.valid) {
      logger.warn('Invalid date range selected', { range: selectedRange, error: validation.error });
      return;
    }

    onChange?.(selectedRange);
    restoreFocusRef.current = true;
    onClose?.();
  }, [selectedRange, locale, onChange, onClose]);

  // Clear selection
  const handleClear = useCallback(() => {
    const emptyRange = { from: undefined, to: undefined };
    setSelectedRange(emptyRange);
    onChange?.(emptyRange);
  }, [onChange]);

  // Handle month navigation
  const handlePreviousMonth = useCallback(() => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() - 1);
      return newMonth;
    });
  }, []);

  const handleNextMonth = useCallback(() => {
    setCurrentMonth(prev => {
      const newMonth = new Date(prev);
      newMonth.setMonth(newMonth.getMonth() + 1);
      return newMonth;
    });
  }, []);

  const popoverWidth = isCompact ? 320 : 360;

  const anchorLeft = useMemo(() => {
    if (isMobile || !anchor) return 0;
    const maxOffset = Math.max(0, anchor.containerWidth - popoverWidth);
    const desiredCenter = anchor.left + anchor.width / 2 - popoverWidth / 2;
    return Math.min(Math.max(0, desiredCenter), maxOffset);
  }, [anchor, isMobile, popoverWidth]);

  const arrowLeft = useMemo(() => {
    if (isMobile || !anchor) return 16;
    const relativeCenter = anchor.left + anchor.width / 2 - anchorLeft;
    return Math.min(Math.max(12, relativeCenter), popoverWidth - 12);
  }, [anchor, anchorLeft, isMobile, popoverWidth]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => {
      popoverRef.current?.querySelector<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )?.focus();
    }, 0);

    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!popoverRef.current) return;
      if (popoverRef.current.contains(event.target as Node)) {
        return;
      }
      restoreFocusRef.current = false;
      onClose?.();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      event.stopPropagation();
      restoreFocusRef.current = true;
      onClose?.();
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      if (restoreFocusRef.current) previouslyFocusedRef.current?.focus();
      restoreFocusRef.current = false;
    };
  }, [isOpen, onClose]);

  const DatePickerContent = () => (
    <div className={isCompact ? "space-y-1" : "space-y-1.5"}>
      {/* Calendar with inline controls */}
      <div className="relative" role="application" aria-label={dp?.calendar ?? 'Date picker calendar'}>
        {/* Clear button positioned top-right, only show when dates selected */}
        {(selectedRange?.from || selectedRange?.to) && (
          <button
            type="button"
            onClick={handleClear}
            className={`absolute top-0 right-0 z-10 p-1.5 text-subtle hover:text-body hover:bg-[var(--layer-surface-alt)] rounded-full transition-colors ${isCompact ? 'p-1' : 'p-1.5'}`}
            aria-label={dp?.clearSelected ?? 'Clear selected dates'}
            title={dp?.clearDates ?? 'Clear dates'}
          >
            <svg width={isCompact ? "14" : "16"} height={isCompact ? "14" : "16"} viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Custom navigation buttons for all screen sizes */}
        <button
          type="button"
          onClick={handlePreviousMonth}
          className={`absolute left-4 top-0 z-20 w-7 h-7 flex items-center justify-center text-subtle hover:text-body hover:bg-[var(--layer-surface-alt)] rounded-md transition-colors border border-soft ${isCompact ? 'w-6 h-6 left-2' : 'w-7 h-7 left-4'}`}
          aria-label={dp?.prevMonth ?? 'Previous month'}
          style={{ top: '0rem' }}
        >
          <svg width={isCompact ? "12" : "14"} height={isCompact ? "12" : "14"} viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z" />
          </svg>
        </button>
        <button
          type="button"
          onClick={handleNextMonth}
          className={`absolute right-4 top-0 z-20 w-7 h-7 flex items-center justify-center text-subtle hover:text-body hover:bg-[var(--layer-surface-alt)] rounded-md transition-colors border border-soft ${isCompact ? 'w-6 h-6 right-2' : 'w-7 h-7 right-4'}`}
          aria-label={dp?.nextMonth ?? 'Next month'}
          style={{ top: '0rem' }}
        >
          <svg width={isCompact ? "12" : "14"} height={isCompact ? "12" : "14"} viewBox="0 0 16 16" fill="currentColor">
            <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z" />
          </svg>
        </button>

        <DayPicker
          mode="range"
          selected={selectedRange as RDPDateRange}
          onSelect={handleDateSelect}
          disabled={disabledDays}
          numberOfMonths={1}
          showOutsideDays={false}
          className={`custom-day-picker ${!isMobile ? 'streamlined' : ''} ${isCompact ? 'compact' : ''}`}
          aria-label={dp?.selectDates ?? 'Select check-in and check-out dates'}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          hideNavigation={true}
        />
      </div>

      {/* Single action button - Apply only shows when both dates selected */}
      {
        selectedRange?.from && selectedRange?.to && (
          <button
            type="button"
            onClick={handleApply}
            className={`w-full px-4 py-2 text-sm font-medium text-white bg-brand-600 rounded-md hover:bg-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-500 focus:ring-offset-1 transition-colors ${isCompact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2 text-sm'}`}
            aria-label={dp?.applyRange ?? 'Apply selected date range'}
          >
            {dp?.applyDates ?? 'Apply dates'}
          </button>
        )
      }
    </div>
  );

  // Desktop popover - streamlined and responsive, now used on all screen sizes
  return isOpen ? (
    <div
      ref={popoverRef}
      className={`absolute top-full left-0 mt-2 surface-card rounded-xl shadow-xl border border-soft p-3 z-50 date-picker-popover ${isCompact ? 'compact-datepicker' : ''}`}
      role="dialog"
      aria-label={dp?.rangePicker ?? 'Date range picker'}
      style={{
        width: isCompact ? 'min(90vw, 320px)' : 'min(92vw, 360px)',
        maxHeight: isCompact ? 'min(70vh, 380px)' : 'min(80vh, 450px)',
        overflow: 'visible',
        left: anchorLeft
      }}
    >
      <div
        className="absolute -top-2 w-4 h-4 surface-card border-l border-t border-soft transform rotate-45 date-picker-arrow"
        style={{ left: arrowLeft }}
      />
      <DatePickerContent />
    </div>
  ) : null;
}
