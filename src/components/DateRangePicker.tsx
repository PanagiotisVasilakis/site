"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { DayPicker, type DateRange as RDPDateRange } from 'react-day-picker';
import { 
  DateRange, 
  getBlockedDates, 
  getDateAvailability, 
  validateDateRange, 
  getNights
} from '@/lib/dateUtils';
import { logger } from '@/lib/logger';
import BottomSheet from './BottomSheet';

// Import styles
import 'react-day-picker/dist/style.css';

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (range: DateRange) => void;
  onClose?: () => void;
  isOpen?: boolean;
  showPricing?: boolean;
}

export default function DateRangePicker({
  value,
  onChange,
  onClose,
  isOpen = false,
  showPricing = true
}: DateRangePickerProps) {
  const [selectedRange, setSelectedRange] = useState<DateRange>(value || { from: undefined, to: undefined });
  const [currentMonth, setCurrentMonth] = useState<Date>(new Date());
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount
  useEffect(() => {
    const checkViewport = () => {
      const w = window.innerWidth;
      setIsMobile(w < 768);
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
        onClose?.();
      }, 500);
    }
  }, [onChange, onClose]);

  // Apply selection
  const handleApply = useCallback(() => {
    const validation = validateDateRange(selectedRange);
    if (!validation.valid) {
      logger.warn('Invalid date range selected', { range: selectedRange, error: validation.error });
      return;
    }

    onChange?.(selectedRange);
    onClose?.();
  }, [selectedRange, onChange, onClose]);

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

  // Get pricing info for selected range
  const pricingInfo = useMemo(() => {
    if (!selectedRange?.from || !selectedRange?.to || !showPricing) return null;

    const nights = getNights(selectedRange);
    if (nights === 0) return null;

    // Calculate total price (mock calculation)
    let total = 0;
    const currentDate = new Date(selectedRange.from);
    
    for (let i = 0; i < nights; i++) {
      const availability = getDateAvailability(currentDate);
      if (availability.available && availability.price) {
        total += availability.price;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return {
      nights,
      total,
      avgPerNight: Math.round(total / nights)
    };
  }, [selectedRange, showPricing]);


  const DatePickerContent = () => (
    <div className="space-y-3">
      {/* Calendar with inline controls */}
      <div className="relative" role="application" aria-label="Date picker calendar">
        {/* Clear button positioned top-right, only show when dates selected */}
        {(selectedRange?.from || selectedRange?.to) && (
          <button
            onClick={handleClear}
            className="absolute top-0 right-0 z-10 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full transition-colors"
            aria-label="Clear selected dates"
            title="Clear dates"
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L8 6.586l2.293-2.293a1 1 0 111.414 1.414L9.414 8l2.293 2.293a1 1 0 01-1.414 1.414L8 9.414l-2.293 2.293a1 1 0 01-1.414-1.414L6.586 8 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Custom navigation buttons for desktop streamlined layout */}
        {!isMobile && (
          <>
            <button
              onClick={handlePreviousMonth}
              className="absolute left-4 top-0 z-20 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
              aria-label="Previous month"
              style={{ top: '0rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M11.354 1.646a.5.5 0 0 1 0 .708L5.707 8l5.647 5.646a.5.5 0 0 1-.708.708l-6-6a.5.5 0 0 1 0-.708l6-6a.5.5 0 0 1 .708 0z"/>
              </svg>
            </button>
            <button
              onClick={handleNextMonth}
              className="absolute right-4 top-0 z-20 w-7 h-7 flex items-center justify-center text-gray-500 hover:text-gray-700 hover:bg-gray-50 rounded-md transition-colors border border-gray-200"
              aria-label="Next month"
              style={{ top: '0rem' }}
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
                <path fillRule="evenodd" d="M4.646 1.646a.5.5 0 0 1 .708 0l6 6a.5.5 0 0 1 0 .708l-6 6a.5.5 0 0 1-.708-.708L10.293 8 4.646 2.354a.5.5 0 0 1 0-.708z"/>
              </svg>
            </button>
          </>
        )}
        
        <DayPicker
          mode="range"
          selected={selectedRange as RDPDateRange}
          onSelect={handleDateSelect}
          disabled={disabledDays}
          numberOfMonths={2}
          showOutsideDays={false}
          className={`custom-day-picker ${!isMobile ? 'streamlined' : ''}`}
          aria-label="Select check-in and check-out dates"
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          hideNavigation={!isMobile}
        />
      </div>

      {/* Compact pricing summary - only when both dates selected */}
      {pricingInfo && selectedRange?.from && selectedRange?.to && (
        <div className="bg-brand-50 border border-brand-200 rounded-lg px-3 py-2" role="region" aria-label="Booking summary">
          <div className="flex justify-between items-center text-sm">
            <span className="text-gray-600">{pricingInfo.nights} night{pricingInfo.nights !== 1 ? 's' : ''}</span>
            <span className="font-semibold text-brand-800">€{pricingInfo.total}</span>
          </div>
        </div>
      )}

      {/* Single action button - Apply only shows when both dates selected */}
      {selectedRange?.from && selectedRange?.to && (
        <button
          onClick={handleApply}
          className="w-full px-4 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 transition-colors"
          aria-label="Apply selected date range"
        >
          Apply dates
        </button>
      )}
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose || (() => {})}
        title="Select dates"
        maxHeight="75vh"
      >
        <DatePickerContent />
      </BottomSheet>
    );
  }

  // Desktop popover - streamlined and responsive
  return isOpen ? (
    <div 
      className="absolute top-full left-0 mt-2 bg-white rounded-xl shadow-xl border border-gray-200 p-4 pr-5 z-50"
      role="dialog"
      aria-modal="true"
      aria-label="Date range picker"
      style={{ width: 'min(92vw, 640px)', maxHeight: 'min(80vh, 450px)', overflow: 'visible' }}
    >
      <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45" />
      <DatePickerContent />
    </div>
  ) : null;
}
