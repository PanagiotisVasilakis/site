"use client";
import { useState, useEffect, useMemo, useCallback } from 'react';
import { DayPicker, type DateRange as RDPDateRange } from 'react-day-picker';
import { format } from 'date-fns';
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
  // currentMonth state removed (unused)
  const [isMobile, setIsMobile] = useState(false);

  // Check if mobile on mount
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
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
    <div className="space-y-6">
      {/* Date Selection Header */}
      <div className="grid grid-cols-2 gap-4">
        <div className="text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Check-in</div>
          <div className="text-lg font-medium">
            {selectedRange?.from ? format(selectedRange.from, 'MMM d') : 'Select date'}
          </div>
        </div>
        <div className="text-center">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Check-out</div>
          <div className="text-lg font-medium">
            {selectedRange?.to ? format(selectedRange.to, 'MMM d') : 'Select date'}
          </div>
        </div>
      </div>

      {/* Calendar */}
      <div className="flex justify-center">
        <DayPicker
          mode="range"
          selected={selectedRange as RDPDateRange}
          onSelect={handleDateSelect}
          disabled={disabledDays}
          numberOfMonths={isMobile ? 1 : 2}
          showOutsideDays
          className="custom-day-picker"
        />
      </div>

      {/* Pricing Summary */}
      {pricingInfo && (
        <div className="bg-gray-50 rounded-lg p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>€{pricingInfo.avgPerNight} x {pricingInfo.nights} nights</span>
            <span>€{pricingInfo.total}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span>Total</span>
            <span>€{pricingInfo.total}</span>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-4">
        <button
          onClick={handleClear}
          className="flex-1 px-4 py-3 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2"
        >
          Clear
        </button>
        <button
          onClick={handleApply}
          disabled={!selectedRange?.from || !selectedRange?.to}
          className="flex-1 px-4 py-3 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Apply
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <BottomSheet
        isOpen={isOpen}
        onClose={onClose || (() => {})}
        title="Select dates"
        maxHeight="90vh"
      >
        <DatePickerContent />
      </BottomSheet>
    );
  }

  // Desktop popover - simplified for testing
  return isOpen ? (
    <div className="absolute top-full left-0 mt-2 bg-white rounded-lg shadow-xl border border-gray-200 p-6 z-50 min-w-[600px]">
      <div className="absolute -top-2 left-4 w-4 h-4 bg-white border-l border-t border-gray-200 transform rotate-45" />
      <DatePickerContent />
    </div>
  ) : null;
}
