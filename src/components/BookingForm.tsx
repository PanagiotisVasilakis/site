"use client";
import React, { useState } from 'react';
import Link from 'next/link';
import { useForm, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import clsx from 'clsx';
import { DateRange, formatDateRange, getNights } from '@/lib/dateUtils';
import { trackEvent } from '@/lib/analyticsClient';
import { logger } from '@/lib/logger-client';

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

// Zod schema for form validation
const bookingSchema = z.object({
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
  email: z.string().min(1, 'Email is required').email('Please enter a valid email address'),
  phone: z.string().min(1, 'Phone number is required'),
  arrivalTime: z.string().optional(),
  specialRequests: z.string().optional()
});

type BookingFormData = z.infer<typeof bookingSchema>;

export default function BookingForm({ dateRange, guests, total, locale, submissionDelayMs = 2000 }: BookingFormProps) {
  const [submitted, setSubmitted] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    // trigger // used if we needed manual trigger, but RHF handles blur/submit auto
  } = useForm<BookingFormData>({
    resolver: zodResolver(bookingSchema),
    mode: 'onBlur', // Validate on blur for better UX
    defaultValues: {
      firstName: '',
      lastName: '',
      email: '',
      phone: '',
      specialRequests: '',
      arrivalTime: ''
    }
  });

  const onSubmit = async (data: BookingFormData) => {
    try {
      // Track booking attempt
      trackEvent('booking_submitted', {
        nights: getNights(dateRange),
        guests,
        total,
        arrivalTime: data.arrivalTime || 'not_specified'
      });

      // Simulate API call with realistic delay
      await new Promise(resolve => setTimeout(resolve, submissionDelayMs));

      // In a real app, you would:
      // const response = await fetch('/api/bookings', { ... });

      setSubmitted(true);

    } catch (err) {
      logger.error('Booking submission failed', err instanceof Error ? err : { error: String(err) });
    }
  };

  const onInvalid = (errors: FieldErrors<BookingFormData>) => {
    logger.warn('Booking form validation failed', { errors });
    // Focus is handled automatically by RHF, but we log for analytics
  };

  if (submitted) {
    return (
      <div className="text-center py-12 space-y-4">
        <div className="text-6xl" aria-hidden>🎉</div>
        <div>
          <h2 className="text-2xl font-serif italic font-bold text-green-600 mb-2">Booking Confirmed!</h2>
          <p className="text-gray-600 mb-4">
            Thank you! Your booking request has been sent.
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

  // Helper for input classes
  const getInputClasses = (error?: boolean) => clsx(
    "w-full px-4 py-3 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-[color:var(--brand-400)] focus:border-[color:var(--brand-400)]",
    error
      ? "border-red-400 bg-red-50 text-[color:var(--fg-default)]"
      : "border-[color:var(--border-soft)] bg-[color:var(--layer-surface)] text-[color:var(--fg-default)] placeholder:text-[color:var(--fg-muted)]"
  );

  return (
    <form onSubmit={handleSubmit(onSubmit, onInvalid)} className="space-y-6" noValidate>
      {/* Live region for form-wide announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {Object.keys(errors).length > 0 && (
          `Form has ${Object.keys(errors).length} error${Object.keys(errors).length > 1 ? 's' : ''}. Please review and correct the highlighted fields.`
        )}
        {submitted && "Booking submitted successfully!"}
        {isSubmitting && "Submitting booking, please wait..."}
      </div>

      <div>
        <h3 className="text-lg font-serif italic font-bold mb-4 text-[color:var(--fg-default)]">Guest information</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">First name *</label>
            <input
              id="firstName"
              type="text"
              {...register('firstName')}
              className={getInputClasses(!!errors.firstName)}
              placeholder="John"
              aria-invalid={!!errors.firstName}
              aria-describedby={errors.firstName ? 'firstName-error' : undefined}
            />
            {errors.firstName && (
              <p id="firstName-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.firstName.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="lastName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Last name *</label>
            <input
              id="lastName"
              type="text"
              {...register('lastName')}
              className={getInputClasses(!!errors.lastName)}
              placeholder="Smith"
              aria-invalid={!!errors.lastName}
              aria-describedby={errors.lastName ? 'lastName-error' : undefined}
            />
            {errors.lastName && (
              <p id="lastName-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.lastName.message}
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
              {...register('email')}
              className={getInputClasses(!!errors.email)}
              placeholder="john@example.com"
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? 'email-error' : undefined}
            />
            {errors.email && (
              <p id="email-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.email.message}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="phone" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Phone number *</label>
            <input
              id="phone"
              type="tel"
              {...register('phone')}
              className={getInputClasses(!!errors.phone)}
              placeholder="+30 123 456 7890"
              aria-invalid={!!errors.phone}
              aria-describedby={errors.phone ? 'phone-error' : undefined}
            />
            {errors.phone && (
              <p id="phone-error" className="mt-1 text-sm text-red-600" role="alert">
                {errors.phone.message}
              </p>
            )}
          </div>
        </div>

        <div className="mt-4">
          <label htmlFor="arrivalTime" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">Expected arrival time</label>
          <select
            id="arrivalTime"
            {...register('arrivalTime')}
            className={getInputClasses(false)} // No error state needed usually for optional fields, or reuse logic
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
            {...register('specialRequests')}
            className={getInputClasses(false)}
            placeholder="Any special requirements or requests..."
          />
        </div>
      </div>

      {/* Validation Errors Summary - Only show if user has tried to submit */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">Please fix the following:</h4>
          <ul className="text-sm text-red-700 space-y-1">
            {Object.entries(errors).map(([key, error]) => (
              <li key={key} className="flex items-center gap-2">
                <span aria-hidden>•</span>
                {error.message}
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
        disabled={isSubmitting} // Note: We allow submit even if invalid to show errors on click. Or use !isValid to disable.
        className={clsx(
          "w-full py-4 px-6 rounded-lg font-semibold transition-all",
          isSubmitting
            ? "bg-[color:var(--layer-surface-alt)] text-[color:var(--fg-muted)] cursor-not-allowed"
            : "btn-primary bg-[color:var(--action-bg)] hover:bg-[color:var(--action-bg-hover)] text-[color:var(--action-fg)] shadow-lg hover:shadow-xl hover:-translate-y-0.5"
        )}
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
