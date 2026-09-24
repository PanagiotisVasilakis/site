'use client'

import Link from 'next/link'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import internalFetch from '@/lib/internalFetchClient'
import { Badge } from '@/components/ui'

interface BookingData {
  booking: {
    id: string
    reference?: string
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
    email?: string
    phone: string
    countryOrigin: string
  }
  checkin?: {
    arrivalTime: string
    specialRequests?: string
    acceptedAt: string
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
  totalCheckins: number
  bookingsBySource: Record<string, number>
  bookingsByStatus: Record<string, number>
}

export default function GuestDataViewer() {
  const [bookings, setBookings] = useState<BookingData[]>([])
  const [arrivalRequests, setArrivalRequests] = useState<CheckInRequestData[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'reference' | 'phone' | 'date'>('reference')
  const [claimGrant, setClaimGrant] = useState<{ bookingId: string; token: string; expiresAt: string } | null>(null)

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
      const response = await internalFetch('/api/admin/check-in-requests?status=all')
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      const data = await response.json()
      if (data.success) {
        setArrivalRequests(data.data.requests || [])
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
        url = `/api/admin/guests?action=search&startDate=${searchQuery}`
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
    setLoading(true)
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
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Claim grant failed')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchAllBookings()
    fetchStatistics()
    fetchArrivalRequests()
  }, [])

  const pendingArrivalRequests = arrivalRequests.filter((request) => request.status === 'pending')

  return (
    <main className="admin-page-shell min-h-screen p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="surface-card rounded-xl shadow-lg p-6 mb-6"
        >
          <h1 className="text-3xl font-serif italic font-bold page-title mb-2">
            🏠 Guest Data Viewer
          </h1>
          <p className="text-body">
            View and manage guest bookings and check-in information
          </p>
        </motion.div>

        {/* Statistics */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6 text-center"
          >
            <div className="surface-card p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-blue-600">{stats.totalBookings}</div>
              <div className="text-sm text-subtle">Total Bookings</div>
            </div>
            <div className="surface-card p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-green-600">{stats.totalUsers}</div>
              <div className="text-sm text-subtle">Total Users</div>
            </div>
            <div className="surface-card p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-purple-600">{stats.totalClaimedBookings}</div>
              <div className="text-sm text-subtle">Claimed Bookings</div>
            </div>
            <div className="surface-card p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-orange-600">{stats.totalCheckins}</div>
              <div className="text-sm text-subtle">Check-ins</div>
            </div>
          </motion.div>
        )}

        {arrivalRequests.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.15 }}
            className="surface-card rounded-lg shadow p-6 mb-6"
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
              <div>
                <h2 className="text-xl font-serif italic font-bold section-title">Arrival Time Requests</h2>
                <p className="text-body text-sm">
                  {pendingArrivalRequests.length} pending request{pendingArrivalRequests.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  href="/admin/requests"
                  className="px-4 py-2 rounded-full text-sm font-semibold surface-interactive"
                >
                  Open inbox
                </Link>
                <button
                  onClick={fetchArrivalRequests}
                  className="px-4 py-2 rounded-full text-sm font-semibold surface-interactive"
                >
                  Refresh
                </button>
              </div>
            </div>
            <div className="grid gap-3">
              {arrivalRequests.slice(0, 6).map((request) => (
                <div key={request.id} className="surface-panel rounded-lg p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-text-accent">
                          Requested arrival: {request.requestedTime}
                        </h3>
                        <Badge variant={request.status}>
                          {request.status}
                        </Badge>
                      </div>
                      <p className="text-sm text-body mt-1">
                        {request.guestEmail || request.guestPhone || request.userId || 'Guest details unavailable'}
                      </p>
                      {request.message && (
                        <p className="text-sm text-body mt-2">{request.message}</p>
                      )}
                    </div>
                    <div className="text-xs text-subtle sm:text-right">
                      <div>{new Date(request.createdAt).toLocaleString()}</div>
                      {request.bookingId && <div>Booking: {request.bookingId}</div>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="surface-card rounded-lg shadow p-6 mb-6"
        >
          <h2 className="text-xl font-serif italic font-bold section-title mb-4">Search Bookings</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'reference' | 'phone' | 'date')}
              className="px-4 py-2 border border-soft rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent surface-interactive"
            >
              <option value="reference">Booking Reference</option>
              <option value="phone">Phone Number</option>
              <option value="date">Date (YYYY-MM-DD)</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchType === 'reference' ? 'ABC123' :
                  searchType === 'phone' ? '+306912345678' :
                    '2024-12-25'
              }
              className="flex-1 px-4 py-2 border border-soft rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent surface-interactive"
            />
            <button
              onClick={handleSearch}
              disabled={loading}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
            <button
              onClick={fetchAllBookings}
              disabled={loading}
              className="px-6 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 disabled:opacity-50"
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
            className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-6 dark:bg-red-900/40 dark:text-red-300 dark:border-red-900"
          >
            {error}
          </motion.div>
        )}

        {claimGrant && (
          <div className="surface-card mb-6 rounded-lg border border-soft p-4" role="status">
            <h2 className="font-semibold">One-time claim token</h2>
            <p className="mt-1 text-sm text-subtle">Booking {claimGrant.bookingId} · expires {new Date(claimGrant.expiresAt).toLocaleString()}</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <code className="min-w-0 flex-1 overflow-x-auto rounded bg-black/10 p-3 text-sm">{claimGrant.token}</code>
              <button type="button" className="btn btn-primary" onClick={() => navigator.clipboard.writeText(claimGrant.token)}>Copy</button>
            </div>
            <p className="mt-2 text-xs text-subtle">The token is shown once. Send it only through the intended guest channel.</p>
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
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-body">Loading bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="surface-card rounded-lg shadow p-8 text-center">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-serif italic font-bold section-title mb-2">No Bookings Found</h3>
              <p className="text-body">
                Bookings will appear here after guests complete the check-in process.
              </p>
            </div>
          ) : (
            bookings.map((booking, index) => (
              <motion.div
                key={booking.booking.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.1 * index }}
                className="surface-panel rounded-lg shadow p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-serif italic font-bold section-title">
                      Booking {booking.booking.reference || booking.booking.id}
                    </h3>
                    <p className="text-body">
                      {booking.booking.startDate} to {booking.booking.endDate}
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
                        className="rounded-full bg-emerald-100 px-3 py-1 text-sm text-emerald-900 hover:bg-emerald-200"
                      >
                        Issue claim
                      </button>
                    )}
                    <button
                      onClick={() => exportBooking(booking.booking.id)}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200 dark:bg-blue-900/40 dark:text-blue-300"
                    >
                      Export
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {booking.user ? (
                    <div>
                      <h4 className="font-medium text-text-accent">Guest Info</h4>
                      <p className="text-sm text-body">📱 {booking.user.phone}</p>
                      <p className="text-sm text-body">📧 {booking.user.email || 'Not provided'}</p>
                      <p className="text-sm text-body">🌍 {booking.user.countryOrigin}</p>
                    </div>
                  ) : (
                    <div>
                      <h4 className="font-medium text-text-accent">Guest Info</h4>
                      <p className="text-sm text-body">No guest account linked yet.</p>
                    </div>
                  )}
                  <div>
                    <h4 className="font-medium text-text-accent">Booking Details</h4>
                    <p className="text-sm text-body">📄 Source: {booking.booking.source}</p>
                    <p className="text-sm text-body">🔗 Provider: {booking.booking.provider}</p>
                    <p className="text-sm text-body">📝 Created: {new Date(booking.booking.createdAt).toLocaleDateString()}</p>
                  </div>
                  {booking.checkin && (
                    <div>
                      <h4 className="font-medium text-text-accent">Check-in</h4>
                      <p className="text-sm text-body">⏰ {booking.checkin.arrivalTime}</p>
                      {booking.checkin.specialRequests && (
                        <p className="text-sm text-body">💬 {booking.checkin.specialRequests}</p>
                      )}
                    </div>
                  )}
                </div>

              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </main>
  )
}
