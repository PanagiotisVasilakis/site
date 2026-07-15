"use client";
import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useForm, FieldErrors } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import clsx from 'clsx';
import { DateRange, formatDateRange, getNights } from '@/lib/dateUtils';
import { trackEvent } from '@/lib/analyticsClient';
import internalFetch from '@/lib/internalFetchClient';
import { logger } from '@/lib/logger-client';
import type { BookingFormDictionary } from '@/i18n/domains/booking';

interface BookingFormProps {
  dateRange: DateRange;
  locale: string;
  labels: BookingFormDictionary;
  propertyName: string;
  /**
   * Optional delay after successful delivery. Tests can use this to exercise loading state.
   */
  submissionDelayMs?: number;
}

interface BookingFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  arrivalTime?: string;
  specialRequests?: string;
}

export default function BookingForm({ dateRange, locale, labels, propertyName, submissionDelayMs = 0 }: BookingFormProps) {
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [idempotencyKey] = useState(() => globalThis.crypto.randomUUID());
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (submitted) successRef.current?.focus();
  }, [submitted]);

  // Build the validation schema with localized messages
  const bookingSchema = useMemo(
    () =>
      z.object({
        firstName: z.string().min(1, labels.firstNameRequired),
        lastName: z.string().min(1, labels.lastNameRequired),
        email: z.string().min(1, labels.emailRequired).email(labels.emailInvalid),
        phone: z.string().min(1, labels.phoneRequired),
        arrivalTime: z.string().optional(),
        specialRequests: z.string().optional()
      }),
    [labels]
  );

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
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
    setSubmitError('');
    try {
      // Track booking attempt
      trackEvent('booking_submitted', {
        nights: getNights(dateRange),
        hasArrivalTime: Boolean(data.arrivalTime),
      });

      const response = await internalFetch('/api/booking-requests', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({
          propertyName,
          locale,
          dateRange: {
            from: dateRange.from?.toISOString(),
            to: dateRange.to?.toISOString(),
          },
          guest: {
            ...data,
            arrivalTime: data.arrivalTime || undefined,
            specialRequests: data.specialRequests?.trim() || undefined,
          },
        }),
      });

      const responseBody = await response.json().catch(() => null);
      if (!response.ok || !responseBody?.success) {
        setSubmitError(responseBody?.error?.message || labels.submitFailed);
        return;
      }

      if (submissionDelayMs > 0) {
        await new Promise(resolve => setTimeout(resolve, submissionDelayMs));
      }
      setSubmitted(true);

    } catch (err) {
      logger.error('Booking submission failed', err instanceof Error ? err : { error: String(err) });
      setSubmitError(labels.submitFailed);
    }
  };

  const onInvalid = (errors: FieldErrors<BookingFormData>) => {
    logger.warn('Booking form validation failed', { errors });
    // Focus is handled automatically by RHF, but we log for analytics
  };

  if (submitted) {
    return (
      <div
        ref={successRef}
        className="text-center py-12 space-y-4 outline-none"
        role="status"
        aria-live="polite"
        aria-atomic="true"
        tabIndex={-1}
      >
        <span className="sr-only">{labels.submittedAnnounce}</span>
        <div className="text-6xl" aria-hidden>🎉</div>
        <div>
          <h2 className="text-2xl font-serif italic font-bold text-green-600 mb-2">{labels.confirmedTitle}</h2>
          <p className="text-gray-600 mb-4">
            {labels.confirmedMessage}
          </p>
          <div className="bg-green-50 rounded-lg p-4 text-sm space-y-1">
            <div><strong>{labels.propertyLabel}</strong> {propertyName}</div>
            <div><strong>{labels.datesLabel}</strong> {formatDateRange(dateRange, locale === 'el' ? 'el' : 'en')}</div>
          </div>
        </div>
        <div className="flex gap-3 justify-center">
          <Link href={`/${locale}/apartment`} className="btn-outline">
            {labels.viewProperty}
          </Link>
          <Link href={`/${locale}`} className="btn-primary">
            {labels.backHome}
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
        {Object.keys(errors).length > 0 && labels.formErrorsAnnounce}
        {submitError && labels.submitFailed}
        {isSubmitting && labels.submittingAnnounce}
      </div>

      <div>
        <h3 className="text-lg font-serif italic font-bold mb-4 text-[color:var(--fg-default)]">{labels.guestInfo}</h3>

        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="firstName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.firstName}</label>
            <input
              id="firstName"
              type="text"
              {...register('firstName')}
              className={getInputClasses(!!errors.firstName)}
              placeholder={labels.firstNamePlaceholder}
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
            <label htmlFor="lastName" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.lastName}</label>
            <input
              id="lastName"
              type="text"
              {...register('lastName')}
              className={getInputClasses(!!errors.lastName)}
              placeholder={labels.lastNamePlaceholder}
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
            <label htmlFor="email" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.email}</label>
            <input
              id="email"
              type="email"
              {...register('email')}
              className={getInputClasses(!!errors.email)}
              placeholder={labels.emailPlaceholder}
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
            <label htmlFor="phone" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.phone}</label>
            <input
              id="phone"
              type="tel"
              {...register('phone')}
              className={getInputClasses(!!errors.phone)}
              placeholder={labels.phonePlaceholder}
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
          <label htmlFor="arrivalTime" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.arrivalTime}</label>
          <select
            id="arrivalTime"
            {...register('arrivalTime')}
            className={getInputClasses(false)}
          >
            <option value="">{labels.arrivalSelect}</option>
            <option value="morning">{labels.arrivalMorning}</option>
            <option value="afternoon">{labels.arrivalAfternoon}</option>
            <option value="evening">{labels.arrivalEvening}</option>
            <option value="late">{labels.arrivalLate}</option>
          </select>
        </div>

        <div className="mt-4">
          <label htmlFor="specialRequests" className="block text-sm font-medium text-[color:var(--fg-muted)] mb-1">{labels.specialRequests}</label>
          <textarea
            id="specialRequests"
            rows={3}
            {...register('specialRequests')}
            className={getInputClasses(false)}
            placeholder={labels.specialRequestsPlaceholder}
          />
        </div>
      </div>

      {/* Validation Errors Summary - Only show if user has tried to submit */}
      {Object.keys(errors).length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <h4 className="text-sm font-medium text-red-800 mb-2">{labels.fixErrors}</h4>
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

      {submitError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700" role="alert">
          {submitError}
        </div>
      )}

      {/* Terms */}
      <div className="text-xs text-[color:var(--fg-muted)] bg-[color:var(--layer-bg-subtle)] rounded-lg p-4">
        <p>{labels.terms}</p>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isSubmitting}
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
            {labels.processing}
          </span>
        ) : (
          labels.confirm
        )}
      </button>
    </form>
  );
}
