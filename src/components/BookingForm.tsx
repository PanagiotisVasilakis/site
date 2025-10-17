"use client";
import React, { useState, useCallback } from 'react';
import Link from 'next/link';
import { DateRange, formatDateRange, getNights } from '@/lib/dateUtils';
import { trackEvent } from '@/lib/analyticsClient';
import { logger } from '@/lib/logger-enterprise';

interface BookingFormProps {
  dateRange: DateRange;
  guests: number;
  total: number;
  locale: string;
  /**
   * Optional override for the artificial submission delay (ms). Defaults to 2000 for UX realism.
   * Tests can pass a much smaller value to avoid long waits.
   */
  submissionDelayMs?: number;
}

interface GuestDetails {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  specialRequests?: string;
  arrivalTime?: string;
}

export default function BookingForm({ dateRange, guests, total, locale, submissionDelayMs = 2000 }: BookingFormProps) {
  const [guestDetails, setGuestDetails] = useState<GuestDetails>({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    specialRequests: '',
    arrivalTime: ''
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const updateGuestDetails = useCallback(<K extends keyof GuestDetails>(
    key: K, 
    value: GuestDetails[K]
  ) => {
    setGuestDetails(prev => ({ ...prev, [key]: value }));
  }, []);

  const validateForm = useCallback((): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];
    
    if (!guestDetails.firstName.trim()) {
      errors.push('First name is required');
    }
    
    if (!guestDetails.lastName.trim()) {
      errors.push('Last name is required');
    }
    
    if (!guestDetails.email.trim()) {
      errors.push('Email is required');
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(guestDetails.email)) {
        errors.push('Please enter a valid email address');
      }
    }
    
    if (!guestDetails.phone.trim()) {
      errors.push('Phone number is required');
    }

    return { valid: errors.length === 0, errors };
  }, [guestDetails]);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    setShowValidation(true);
    
    const validation = validateForm();
    if (!validation.valid) {
      logger.warn('Booking form validation failed', { errors: validation.errors });
      // Focus on first invalid field
      const firstErrorField = document.querySelector('input[required]:invalid, input[aria-invalid="true"]') as HTMLInputElement;
      if (firstErrorField) {
        firstErrorField.focus();
      }
      return;
    }

    setIsSubmitting(true);

    try {
      // Track booking attempt
      trackEvent('booking_submitted', {
        nights: getNights(dateRange),
        guests,
        total,
        arrivalTime: guestDetails.arrivalTime || 'not_specified'
      });

      // Simulate API call with realistic delay
  await new Promise(resolve => setTimeout(resolve, submissionDelayMs));
      
      // In a real app, you would:
      // const response = await fetch('/api/bookings', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({
      //     dateRange,
      //     guests,
      //     guestDetails,
      //     total
      //   })
      // });

      setSubmitted(true);
      
    } catch (err) {
      logger.error('Booking submission failed', err);
    } finally {
      setIsSubmitting(false);
    }
  }, [validateForm, dateRange, guests, total, guestDetails, submissionDelayMs]);

  const getFieldError = (fieldName: keyof GuestDetails): string | null => {
    if (!showValidation) return null;
    
    const validation = validateForm();
    const fieldErrors = validation.errors.filter(error => {
      return error.toLowerCase().includes(fieldName.toLowerCase()) || 
             (fieldName === 'firstName' && error.includes('First name')) ||
             (fieldName === 'lastName' && error.includes('Last name')) ||
             (fieldName === 'email' && error.includes('email')) ||
             (fieldName === 'phone' && error.includes('Phone'));
    });
    
    return fieldErrors[0] || null;
  };

  if (submitted) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-6xl" aria-hidden>🎉</div>
        <div>
          <h2 className="text-2xl font-bold text-green-600 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Thank you {guestDetails.firstName}! Your booking request has been sent.
          </p>
          <div className="bg-green-50 rounded-lg p-4 text-sm space-y-1">
            <div><strong>Property:</strong> Seaside Modern Villa</div>
            <div><strong>Dates:</strong> {formatDateRange(dateRange)}</div>
            <div><strong>Guests:</strong> {guests}</div>
            <div><strong>Total:</strong> €{total}</div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href={`/${locale}/apartment`} className="btn-outline">
            View property details
          </Link>
          <Link href={`/${locale}`} className="btn-primary">
            Back to home
          </Link>
        </div>
      </div>
    );
  }

  const validation = validateForm();

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {/* Live region for form-wide announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {!validation.valid && validation.errors.length > 0 && showValidation && (
          `Form has ${validation.errors.length} error${validation.errors.length > 1 ? 's' : ''}. Please review and correct the highlighted fields.`
        )}
        {submitted && "Booking submitted successfully!"}
        {isSubmitting && "Submitting booking, please wait..."}
      </div>
      
      <div>
        <h3 className="text-lg font-semibold mb-4 text-[color:var(--fg-default)]">Guest information</h3>
        
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">First name *</label>
            <input
              id="firstName"
              type="text"
              required
              value={guestDetails.firstName}
              onChange={e => updateGuestDetails('firstName', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors ${getFieldError('firstName') ? 'border-red-400 bg-red-50' : 'border-[color:var(--border-soft)]'}`}
              placeholder="John"
              aria-invalid={!!getFieldError('firstName')}
              aria-describedby={getFieldError('firstName') ? 'firstName-error' : undefined}
            />
            {getFieldError('firstName') && (
              <p id="firstName-error" className="mt-1 text-sm text-red-600" role="alert">
                {getFieldError('firstName')}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Last name *</label>
            <input
              id="lastName"
              type="text"
              required
              value={guestDetails.lastName}
              onChange={e => updateGuestDetails('lastName', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors ${getFieldError('lastName') ? 'border-red-400 bg-red-50' : 'border-[color:var(--border-soft)]'}`}
              placeholder="Smith"
              aria-invalid={!!getFieldError('lastName')}
              aria-describedby={getFieldError('lastName') ? 'lastName-error' : undefined}
            />
            {getFieldError('lastName') && (
              <p id="lastName-error" className="mt-1 text-sm text-red-600" role="alert">
                {getFieldError('lastName')}
              </p>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4 mt-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Email address *</label>
            <input
              id="email"
              type="email"
              required
              value={guestDetails.email}
              onChange={e => updateGuestDetails('email', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors ${getFieldError('email') ? 'border-red-400 bg-red-50' : 'border-[color:var(--border-soft)]'}`}
              placeholder="john@example.com"
              aria-invalid={!!getFieldError('email')}
              aria-describedby={getFieldError('email') ? 'email-error' : undefined}
            />
            {getFieldError('email') && (
              <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                {getFieldError('email')}
              </p>
            )}
          </div>
          
          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Phone number *</label>
            <input
              id="phone"
              type="tel"
              required
              value={guestDetails.phone}
              onChange={e => updateGuestDetails('phone', e.target.value)}
              className={`w-full px-4 py-3 rounded-lg border bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors ${getFieldError('phone') ? 'border-red-400 bg-red-50' : 'border-[color:var(--border-soft)]'}`}
              placeholder="+30 123 456 7890"
              aria-invalid={!!getFieldError('phone')}
              aria-describedby={getFieldError('phone') ? 'phone-error' : undefined}
            />
            {getFieldError('phone') && (
              <p id="phone-error" className="mt-1 text-sm text-red-600" role="alert">
                {getFieldError('phone')}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="arrivalTime" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Expected arrival time</label>
          <select
            id="arrivalTime"
            value={guestDetails.arrivalTime}
            onChange={e => updateGuestDetails('arrivalTime', e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors"
          >
            <option value="">Select arrival time</option>
            <option value="morning">Morning (9:00-12:00)</option>
            <option value="afternoon">Afternoon (12:00-18:00)</option>
            <option value="evening">Evening (18:00-21:00)</option>
            <option value="late">Late arrival (after 21:00)</option>
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="specialRequests" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Special requests</label>
          <textarea
            id="specialRequests"
            rows={3}
            value={guestDetails.specialRequests}
            onChange={e => updateGuestDetails('specialRequests', e.target.value)}
            className="w-full px-4 py-3 rounded-lg border border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)] focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)] transition-colors"
            placeholder="Any special requirements or requests..."
          />
        </div>
      </div>

      {/* Validation Errors */}
      {!validation.valid && validation.errors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Please fix the following:</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {validation.errors.map((error, index) => (
              <li key={index} className="flex items-center gap-2">
                <span aria-hidden>•</span>
                {error}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Terms */}
  <div className="text-xs text-[color:var(--fg-muted)] bg-[color:var(--layer-bg-subtle)] rounded-lg p-4">
        <p>
          By clicking &quot;Confirm booking&quot; you agree to our terms of service and cancellation policy. 
          Your booking is subject to availability confirmation from the host.
        </p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={!validation.valid || isSubmitting}
        className={`w-full py-4 px-6 rounded-lg font-semibold transition-all
          ${validation.valid && !isSubmitting ? 'btn-primary bg-[color:var(--action-bg)] hover:bg-[color:var(--action-bg-hover)] text-[color:var(--action-fg)] shadow-lg hover:shadow-xl hover:-translate-y-0.5' : 'bg-[color:var(--layer-surface-alt)] text-[color:var(--fg-muted)] cursor-not-allowed'}
        `}
      >
        {isSubmitting ? (
          <span className="flex items-center justify-center gap-2">
            <span className="animate-spin" aria-hidden>⏳</span>
            Processing booking...
          </span>
        ) : (
          `Confirm booking • €${total}`
        )}
      </button>
    </form>
  );
}
