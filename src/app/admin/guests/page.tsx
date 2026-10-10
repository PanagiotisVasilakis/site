'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { MotionConfig, motion } from 'framer-motion'
import internalFetch from '@/lib/internalFetchClient'
import { logger } from '@/lib/logger-client'
import { Badge } from '@/components/ui'
import { createPortalBookingEligibilityWindow, isPortalBookingTemporallyEligible } from '@/lib/portalBookingEligibility'
import { addDays, parseIsoDate } from '@/lib/availability/calendarDate'

interface BookingData {
  booking: {
    id: string
    source: string
    provider: string
    externalReference?: string
    accessStatus: 'PENDING' | 'VERIFIED'
    claimedAt?: string
    startDate: string
    endDate: string
    createdAt: string
  }
  user?: {
    id: string
    phone: string
  }
}

interface CheckInRequestData {
  id: string
  bookingId?: string
  userId?: string
  guestName?: string
  guestEmail?: string
  guestPhone?: string
  requestedTime: string
  message?: string
  status: 'pending' | 'approved' | 'rejected'
  createdAt: string
  updatedAt: string
}

interface Statistics {
  totalBookings: number
  totalUsers: number
  totalClaimedBookings: number
  bookingsBySource: Record<string, number>
  bookingsByStatus: Record<string, number>
}

// Same calendar-date window the claim exchange enforces (UTC DATE values).
function isWithinClaimWindow(booking: { startDate: string; endDate: string }): boolean {
  return isPortalBookingTemporallyEligible(
    { startDate: new Date(booking.startDate), endDate: new Date(booking.endDate) },
    createPortalBookingEligibilityWindow(new Date()),
  )
}

// The first valid check-out is the day after check-in. addDays throws past 9999-12-31.
function earliestCheckOut(checkIn: string): string | undefined {
  const start = parseIsoDate(checkIn)
  if (start === null || checkIn === '9999-12-31') return undefined
  return addDays(start, 1)
}

export default function GuestDataViewer() {
  const [bookings, setBookings] = useState<BookingData[]>([])
  const [arrivalRequests, setArrivalRequests] = useState<CheckInRequestData[]>([])
  const [pendingArrivalCount, setPendingArrivalCount] = useState(0)
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [actionBusy, setActionBusy] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'reference' | 'phone' | 'date'>('reference')
  const [claimGrant, setClaimGrant] = useState<{ bookingId: string; token: string; expiresAt: string } | null>(null)
  const [claimCopyStatus, setClaimCopyStatus] = useState<'copied' | 'failed' | null>(null)
  const [newBooking, setNewBooking] = useState({ startDate: '', endDate: '', source: 'ONSITE', externalReference: '' })
  const [createdBookingId, setCreatedBookingId] = useState('')

  const fetchAllBookings = async () => {
    setLoading(true)
    setError('')
    try {
      const response = await internalFetch('/api/admin/guests?action=list')
      const data = await response.json()
      if (response.ok && data.success) {
        setBookings(data.data.bookings || [])
      } else {
        setError(data.error?.message || 'Failed to fetch bookings')
      }
    } catch (error) {
      console.error('Error fetching bookings', error)
      setError('Error fetching data')
    } finally {
      setLoading(false)
    }
  }

  const fetchStatistics = async () => {
    try {
      const response = await internalFetch('/api/admin/guests?action=stats')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        setStats(data.data.statistics)
      }
    } catch (error) {
      console.error('Failed to fetch statistics:', error)
    }
  }

  const fetchArrivalRequests = async () => {
    try {
      const response = await internalFetch('/api/admin/check-in-requests?status=all&limit=6')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        setArrivalRequests(data.data.requests || [])
        setPendingArrivalCount(data.data.summary?.pending ?? 0)
      }
    } catch (error) {
      console.error('Failed to fetch arrival requests:', error)
    }
  }

  const handleSearch = async () => {
    if (!searchQuery.trim()) return

    setLoading(true)
    setError('')
    try {
      let url = ''
      if (searchType === 'reference') {
        url = `/api/admin/guests?action=find&reference=${encodeURIComponent(searchQuery.trim())}`
      } else if (searchType === 'phone') {
        url = `/api/admin/guests?action=phone&phone=${encodeURIComponent(searchQuery)}`
      } else if (searchType === 'date') {
        url = `/api/admin/guests?action=search&startDate=${encodeURIComponent(searchQuery.trim())}`
      }

      const response = await internalFetch(url)
      const data = await response.json()

      if (response.ok && data.success) {
        const resultBookings = searchType === 'reference' ? [data.data.booking] : data.data.bookings
        setBookings(resultBookings || [])
      } else {
        setError(data.error?.message || 'Search failed')
        setBookings([])
      }
    } catch (error) {
      console.error('Search error', error)
      setError('Search error')
      setBookings([])
    } finally {
      setLoading(false)
    }
  }

  const exportBooking = async (bookingId: string) => {
    try {
      const response = await internalFetch(`/api/admin/guests?action=export&bookingId=${bookingId}`)
      if (!response.ok) {
        throw new Error('Export failed')
      }
      const blob = await response.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `booking_${bookingId}_${Date.now()}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Export booking failed', error)
      setError('Export failed')
    }
  }

  const issueClaimGrant = async (bookingId: string, channel: 'REMOTE' | 'ONSITE' = 'REMOTE') => {
    setActionBusy(true)
    setError('')
    try {
      const response = await internalFetch(`/api/admin/bookings/${bookingId}/claim-grants`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ channel, ttlMinutes: 30 }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Claim grant failed')
      setClaimGrant({ bookingId, token: data.data.claimToken, expiresAt: data.data.expiresAt })
      setClaimCopyStatus(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Claim grant failed')
    } finally {
      setActionBusy(false)
    }
  }

  const copyClaimToken = async (token: string) => {
    try {
      await navigator.clipboard.writeText(token)
      setClaimCopyStatus('copied')
    } catch (err) {
      logger.warn('Clipboard copy failed', err instanceof Error ? err : { error: String(err) })
      setClaimCopyStatus('failed')
    }
  }

  const createBooking = async (event: React.FormEvent) => {
    event.preventDefault()
    setActionBusy(true)
    setError('')
    setCreatedBookingId('')
    try {
      const response = await internalFetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: newBooking.startDate,
          endDate: newBooking.endDate,
          source: newBooking.source,
          externalReference: newBooking.externalReference.trim() || undefined,
        }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error?.details?.validationErrors?.[0]?.message || data.error?.message || 'Booking creation failed')
      setCreatedBookingId(data.data.booking.id)
      setNewBooking({ startDate: '', endDate: '', source: 'ONSITE', externalReference: '' })
      await Promise.all([fetchAllBookings(), fetchStatistics()])
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Booking creation failed')
    } finally {
      setActionBusy(false)
    }
  }

  const resetGuestAccess = async (bookingId: string, phone: string) => {
    if (!window.confirm(`Reset the password and sign-in sessions of ${phone} and issue a new claim token?`)) return
    setActionBusy(true)
    setError('')
    try {
      const response = await internalFetch(`/api/admin/bookings/${bookingId}/access-reset`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, ttlMinutes: 30 }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Access reset failed')
      setClaimGrant({ bookingId, token: data.data.claimToken, expiresAt: data.data.expiresAt })
      setClaimCopyStatus(null)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Access reset failed')
    } finally {
      setActionBusy(false)
    }
  }

  const eraseGuest = async (userId: string, phone: string) => {
    if (!window.confirm(`Erase all personal data of the guest ${phone}? This cannot be undone.`)) return
    const auditNote = window.prompt('Reason and how the request was verified, without names, phone numbers or e-mail addresses (kept in the privacy audit record):')?.trim() ?? ''
    if (auditNote.length < 3) return
    setActionBusy(true)
    setError('')
    try {
      const response = await internalFetch(`/api/admin/guests/${userId}/erase`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ confirm: true, auditNote }),
      })
      const data = await response.json()
      if (!response.ok || !data.success) throw new Error(data.error?.message || 'Erasure failed')
      await Promise.all([fetchAllBookings(), fetchStatistics()])
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Erasure failed')
    } finally {
      setActionBusy(false)
    }
  }

  useEffect(() => {
    fetchAllBookings()
    fetchStatistics()
    fetchArrivalRequests()
  }, [])

  return (
    <MotionConfig reducedMotion="user">
    <main className="p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="admin-card rounded-card shadow-lg p-6 mb-6"
        >
          <h1 className="text-3xl font-display italic font-bold admin-title mb-2">
            🏠 Guest Data Viewer
          </h1>
          <p className="admin-muted">
            View and manage guest bookings and check-in information
          </p>
        </motion.div>

        {/* Statistics */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-center"
          >
            <div className="admin-card p-4 rounded-tile shadow">
              <div className="text-2xl font-bold admin-info-text">{stats.totalBookings}</div>
              <div className="text-sm admin-muted">Total Bookings</div>
            </div>
            <div className="admin-card p-4 rounded-tile shadow">
              <div className="text-2xl font-bold admin-success-text">{stats.totalUsers}</div>
              <div className="text-sm admin-muted">Total Users</div>
            </div>
            <div className="admin-card p-4 rounded-tile shadow">
              <div className="text-2xl font-bold admin-olive-text">{stats.totalClaimedBookings}</div>
              <div className="text-sm admin-muted">Claimed Bookings</div>
            </div>
          </motion.div>
        )}

        {arrivalRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="admin-card rounded-tile shadow p-6 mb-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h2 className="text-xl font-display italic font-bold admin-title">Arrival Time Requests</h2>
                <p className="admin-muted text-sm">
                  {pendingArrivalCount} pending request{pendingArrivalCount === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/requests"
                  className="admin-action-outline shell-link"
                >
                  Open inbox
                </Link>
                <button
                  onClick={fetchArrivalRequests}
                  className="admin-action-outline"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="grid gap-3">
              {arrivalRequests.slice(0, 6).map((request) => (
                <div key={request.id} className="admin-panel rounded-tile p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold admin-accent">
                          Requested arrival: {request.requestedTime}
                        </h3>
                        <Badge variant={request.status}>
                          {request.status}
                        </Badge>
                      </div>
                      <p className="text-sm admin-muted mt-1">
                        {request.guestEmail || request.guestPhone || request.userId || 'Guest details unavailable'}
                      </p>
                      {request.message && (
                        <p className="text-sm admin-muted mt-2">{request.message}</p>
                      )}
                    </div>
                    <div className="text-xs admin-muted sm:text-right">
                      <div>{new Date(request.createdAt).toLocaleString()}</div>
                      {request.bookingId && <div>Booking: {request.bookingId}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Create booking */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="admin-card rounded-tile shadow p-6 mb-6"
        >
          <h2 className="text-xl font-display italic font-bold admin-title mb-1">Create Booking</h2>
          <p className="admin-muted text-sm mb-4">Add a confirmed stay, then issue a claim token for the guest.</p>
          <form onSubmit={createBooking} className="grid grid-cols-1 sm:grid-cols-5 gap-4 items-end">
            <label className="text-sm admin-muted flex flex-col gap-1">
              Check-in
              <input
                type="date"
                required
                value={newBooking.startDate}
                onChange={(e) => setNewBooking((current) => ({ ...current, startDate: e.target.value }))}
                className="admin-input px-4 py-2 rounded-tile"
              />
            </label>
            <label className="text-sm admin-muted flex flex-col gap-1">
              Check-out
              <input
                type="date"
                required
                min={earliestCheckOut(newBooking.startDate)}
                value={newBooking.endDate}
                onChange={(e) => setNewBooking((current) => ({ ...current, endDate: e.target.value }))}
                className="admin-input px-4 py-2 rounded-tile"
              />
            </label>
            <label className="text-sm admin-muted flex flex-col gap-1">
              Source
              <select
                value={newBooking.source}
                onChange={(e) => setNewBooking((current) => ({ ...current, source: e.target.value }))}
                className="admin-input px-4 py-2 rounded-tile"
              >
                <option value="ONSITE">Direct / on-site</option>
                <option value="EXTERNAL">External platform</option>
              </select>
            </label>
            <label className="text-sm admin-muted flex flex-col gap-1">
              Reference (optional)
              <input
                type="text"
                maxLength={128}
                value={newBooking.externalReference}
                onChange={(e) => setNewBooking((current) => ({ ...current, externalReference: e.target.value }))}
                placeholder="HMABC123"
                className="admin-input px-4 py-2 rounded-tile"
              />
            </label>
            <button
              type="submit"
              disabled={actionBusy}
              className="admin-tone admin-tone--primary px-6 py-2 rounded-tile disabled:opacity-50"
            >
              Create booking
            </button>
          </form>
          {createdBookingId && (
            <p className="text-sm admin-muted mt-3" role="status">Booking {createdBookingId} created.</p>
          )}
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="admin-card rounded-tile shadow p-6 mb-6"
        >
          <h2 className="text-xl font-display italic font-bold admin-title mb-4">Search Bookings</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'reference' | 'phone' | 'date')}
              className="admin-input px-4 py-2 rounded-tile"
            >
              <option value="reference">Booking Reference</option>
              <option value="phone">Phone Number</option>
              <option value="date">Date (YYYY-MM-DD)</option>
            </select>
            <input
              type={searchType === 'date' ? 'date' : 'text'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchType === 'reference' ? 'ABC123' :
                  searchType === 'phone' ? '+306912345678' :
                    '2024-12-25'
              }
              className="admin-input flex-1 px-4 py-2 rounded-tile"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="admin-tone admin-tone--primary px-6 py-2 rounded-tile disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={fetchAllBookings}
              disabled={loading}
              className="admin-tone admin-tone--neutral px-6 py-2 rounded-tile disabled:opacity-50"
            >
              Show All
            </button>
          </div>
        </motion.div>

        {/* Error Display */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="feedback-error px-4 py-3 rounded mb-6"
          >
            {error}
          </motion.div>
        )}

        {claimGrant && (
          <div className="admin-card mb-6 rounded-tile border p-4" role="status">
            <h2 className="font-semibold">One-time claim token</h2>
            <p className="mt-1 text-sm admin-muted">Booking {claimGrant.bookingId} · expires {new Date(claimGrant.expiresAt).toLocaleString()}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 overflow-x-auto admin-code rounded p-3 text-sm">{claimGrant.token}</code>
              <button type="button" className="admin-action-primary" onClick={() => copyClaimToken(claimGrant.token)}>Copy</button>
            </div>
            {claimCopyStatus && (
              <p className="mt-2 text-sm admin-muted">{claimCopyStatus === 'copied' ? 'Copied' : 'Copy failed, select the token'}</p>
            )}
            <p className="mt-2 text-xs admin-muted">The token is shown once. Send it only through the intended guest channel.</p>
          </div>
        )}

        {/* Bookings List */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="space-y-4"
        >
          {loading ? (
            <div className="text-center py-8">
              <div className="admin-spinner animate-spin rounded-full h-12 w-12 border-b-2 mx-auto"></div>
              <p className="mt-4 admin-muted">Loading bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="admin-card rounded-tile shadow p-8 text-center">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-display italic font-bold admin-title mb-2">No Bookings Found</h3>
              <p className="admin-muted">
                Bookings will appear here after guests complete the check-in process.
              </p>
            </div>
          ) : (
            bookings.map((booking, index) => (
              <motion.div
                key={booking.booking.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                // Only the first few cards are staggered; the rest appear at once.
                transition={{ delay: Math.min(index, 5) * 0.1 }}
                className="admin-card rounded-tile shadow p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-display italic font-bold admin-title">
                      Booking {booking.booking.externalReference || booking.booking.id}
                    </h3>
                    <p className="admin-muted">
                      {new Date(booking.booking.startDate).toLocaleDateString(undefined, { timeZone: 'UTC' })} to {new Date(booking.booking.endDate).toLocaleDateString(undefined, { timeZone: 'UTC' })}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Badge variant={booking.booking.accessStatus === 'VERIFIED' ? 'approved' : 'pending'}>
                      {booking.booking.accessStatus === 'VERIFIED' ? 'Claimed' : 'Unclaimed'}
                    </Badge>
                    {booking.booking.accessStatus !== 'VERIFIED' && (
                      <button
                        type="button"
                        onClick={() => issueClaimGrant(booking.booking.id)}
                        disabled={actionBusy || !isWithinClaimWindow(booking.booking)}
                        title={isWithinClaimWindow(booking.booking) ? undefined : 'Claim tokens can be issued from 7 days before check-in until the check-out date (UTC calendar dates)'}
                        className="admin-tone admin-tone--success rounded-full px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Issue claim
                      </button>
                    )}
                    <button
                      onClick={() => exportBooking(booking.booking.id)}
                      className="admin-tone admin-tone--info px-3 py-1 rounded-full text-sm"
                    >
                      Export
                    </button>
                    {booking.booking.accessStatus === 'VERIFIED' && booking.user && (
                      <button
                        type="button"
                        onClick={() => resetGuestAccess(booking.booking.id, booking.user!.phone)}
                        disabled={actionBusy || !isWithinClaimWindow(booking.booking)}
                        title="Clears the guest's password and sessions and issues a new claim token"
                        className="admin-tone admin-tone--warning px-3 py-1 rounded-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset access
                      </button>
                    )}
                    {booking.user && (
                      <button
                        onClick={() => eraseGuest(booking.user!.id, booking.user!.phone)}
                        disabled={actionBusy}
                        className="admin-tone admin-tone--danger px-3 py-1 rounded-full text-sm disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Erase guest
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {booking.user ? (
                    <div>
                      <h4 className="font-medium admin-accent">Guest Info</h4>
                      <p className="text-sm admin-muted">📱 {booking.user.phone}</p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-medium admin-accent">Guest Info</h4>
                      <p className="text-sm admin-muted">No guest account linked yet.</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium admin-accent">Booking Details</h4>
                    <p className="text-sm admin-muted">📄 Source: {booking.booking.source}</p>
                    <p className="text-sm admin-muted">🔗 Provider: {booking.booking.provider}</p>
                    <p className="text-sm admin-muted">📝 Created: {new Date(booking.booking.createdAt).toLocaleDateString()}</p>
                  </div>
                </div>

              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </main>
    </MotionConfig>
  )
}
