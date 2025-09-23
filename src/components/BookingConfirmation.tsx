/**
 * Booking Confirmation Component
 * Displays booking details and confirmation (without payment processing)
 */

'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, AlertCircle, Download, Mail } from 'lucide-react';

interface BookingDetails {
  id: string;
  reference: string;
  startDate: string;
  endDate: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  amount?: number;
  currency?: string;
  status: 'pending' | 'confirmed' | 'cancelled';
}

interface BookingConfirmationProps {
  booking: BookingDetails;
  onConfirm: () => void;
  onCancel: () => void;
}

export function BookingConfirmation({ booking, onConfirm, onCancel }: BookingConfirmationProps) {
  const [step, setStep] = useState<'details' | 'success' | 'error'>('details');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Calculate dates and duration
  const checkInDate = new Date(booking.startDate);
  const checkOutDate = new Date(booking.endDate);
  const nights = Math.ceil((checkOutDate.getTime() - checkInDate.getTime()) / (1000 * 60 * 60 * 24));

  const handleConfirmBooking = async () => {
    setLoading(true);
    setError(null);

    try {
      // Simulate booking confirmation
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      setStep('success');
      onConfirm();
    } catch (error) {
      console.error('Booking confirmation failed:', error);
      setError('Failed to confirm booking. Please try again.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const formatPrice = (amount: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.toUpperCase(),
    }).format(amount);
  };

  return (
    <div className="max-w-2xl mx-auto bg-white rounded-xl shadow-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Booking Confirmation</h1>
            <p className="text-blue-100 mt-1">Reference: {booking.reference}</p>
          </div>
          <div className="flex items-center space-x-2">
            {step === 'success' && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="bg-green-500 rounded-full p-2"
              >
                <Check className="w-6 h-6" />
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Progress Indicator */}
      <div className="px-6 py-4 bg-gray-50 border-b">
        <div className="flex items-center space-x-4">
          {['details', 'success'].map((stepName, index) => (
            <div key={stepName} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  step === stepName
                    ? 'bg-blue-600 text-white'
                    : ['details', 'success'].indexOf(step) > index
                    ? 'bg-green-500 text-white'
                    : 'bg-gray-300 text-gray-600'
                }`}
              >
                {['details', 'success'].indexOf(step) > index ? (
                  <Check className="w-4 h-4" />
                ) : (
                  index + 1
                )}
              </div>
              {index < 1 && (
                <div
                  className={`w-12 h-1 mx-2 ${
                    ['details', 'success'].indexOf(step) > index
                      ? 'bg-green-500'
                      : 'bg-gray-300'
                  }`}
                />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="p-6">
        <AnimatePresence mode="wait">
          {/* Step 1: Booking Details */}
          {step === 'details' && (
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              key="details"
            >
              <h2 className="text-xl font-semibold mb-6">Booking Details</h2>
              
              <div className="space-y-6">
                {/* Stay Dates */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Stay Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-gray-600">Check-in</p>
                      <p className="font-medium">{formatDate(checkInDate)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Check-out</p>
                      <p className="font-medium">{formatDate(checkOutDate)}</p>
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <p className="text-sm text-gray-600">Duration</p>
                    <p className="font-medium">{nights} night{nights !== 1 ? 's' : ''}</p>
                  </div>
                </div>

                {/* Guest Information */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <h3 className="font-medium text-gray-900 mb-3">Guest Information</h3>
                  <div className="space-y-2">
                    <div>
                      <p className="text-sm text-gray-600">Name</p>
                      <p className="font-medium">{booking.guestName}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Email</p>
                      <p className="font-medium">{booking.guestEmail}</p>
                    </div>
                    <div>
                      <p className="text-sm text-gray-600">Phone</p>
                      <p className="font-medium">{booking.guestPhone}</p>
                    </div>
                  </div>
                </div>

                {/* Price Information (if available) */}
                {booking.amount && booking.currency && (
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h3 className="font-medium text-gray-900 mb-3">Booking Information</h3>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Total Amount</span>
                        <span className="font-semibold">{formatPrice(booking.amount, booking.currency)}</span>
                      </div>
                      <p className="text-sm text-gray-500 mt-2">
                        Payment details will be handled separately
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-4 mt-8">
                <button
                  onClick={onCancel}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmBooking}
                  disabled={loading}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Confirming...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirm Booking
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* Step 2: Success */}
          {step === 'success' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key="success"
              className="text-center"
            >
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6"
              >
                <Check className="w-10 h-10 text-white" />
              </motion.div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Booking Confirmed!</h2>
              <p className="text-gray-600 mb-6">
                Your booking has been confirmed. You will receive a confirmation email shortly.
              </p>

              <div className="bg-green-50 border border-green-200 rounded-lg p-6 mb-6">
                <h3 className="font-semibold text-green-900 mb-2">Booking Confirmed</h3>
                <p className="text-green-800 text-sm">
                  Reference: <span className="font-mono font-medium">{booking.reference}</span>
                </p>
                <p className="text-green-700 text-sm mt-2">
                  Check-in: {formatDate(checkInDate)}
                </p>
              </div>

              <div className="flex gap-4">
                <button className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors flex items-center justify-center gap-2">
                  <Download className="w-4 h-4" />
                  Download Confirmation
                </button>
                <button className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                  <Mail className="w-4 h-4" />
                  Email Confirmation
                </button>
              </div>
            </motion.div>
          )}

          {/* Error State */}
          {step === 'error' && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              key="error"
              className="text-center"
            >
              <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center mx-auto mb-6">
                <AlertCircle className="w-10 h-10 text-white" />
              </div>

              <h2 className="text-2xl font-bold text-gray-900 mb-4">Confirmation Failed</h2>
              <p className="text-gray-600 mb-6">{error}</p>

              <div className="flex gap-4">
                <button
                  onClick={() => {
                    setError(null);
                    setStep('details');
                  }}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Try Again
                </button>
                <button
                  onClick={onCancel}
                  className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}