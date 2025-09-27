'use client'

import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import internalFetch, { ADMIN_SECRET_STORAGE_KEY } from '@/lib/internalFetchClient'

interface BookingData {
  booking: {
    id: string
    reference?: string
    source: string
    startDate: string
    endDate: string
    createdAt: string
  }
  user: {
    id: string
    email?: string
    phone: string
    countryOrigin: string
  }
  identities: Array<{
    type: string
    last4Mask: string
    verifiedAt?: string
  }>
  checkin?: {
    arrivalTime: string
    specialRequests?: string
    acceptedAt: string
  }
}

interface Statistics {
  totalBookings: number
  totalUsers: number
  totalIdentities: number
  totalCheckins: number
  bookingsBySource: Record<string, number>
  bookingsByStatus: Record<string, number>
}

export default function GuestDataViewer() {
  const [bookings, setBookings] = useState<BookingData[]>([])
  const [stats, setStats] = useState<Statistics | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [searchType, setSearchType] = useState<'reference' | 'phone' | 'date'>('reference')

  useEffect(() => {
    if (typeof window === 'undefined') return
    try {
      const params = new URLSearchParams(window.location.search)
      const token = params.get('token')?.trim()
      if (token) {
  window.sessionStorage?.setItem(ADMIN_SECRET_STORAGE_KEY, token)
        params.delete('token')
        const url = new URL(window.location.href)
        url.search = params.toString()
        window.history.replaceState({}, document.title, url.toString())
      }
    } catch (err) {
      console.warn('Failed to persist admin token', err)
    }
  }, [])

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

  const handleSearch = async () => {
    if (!searchQuery.trim()) return
    
    setLoading(true)
    setError('')
    try {
      let url = ''
      if (searchType === 'reference') {
        // For reference search, we need lastName too
        const [reference, lastName] = searchQuery.split(' ')
        if (!lastName) {
          setError('For reference search, please provide: "REFERENCE LASTNAME"')
          setLoading(false)
          return
        }
        url = `/api/admin/guests?action=find&reference=${reference}&lastName=${lastName}`
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

  useEffect(() => {
    fetchAllBookings()
    fetchStatistics()
  }, [])

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-6">
      <div className="max-w-7xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white rounded-xl shadow-lg p-6 mb-6"
        >
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            🏠 Guest Data Viewer
          </h1>
          <p className="text-gray-600">
            View and manage guest bookings and check-in information
          </p>
        </motion.div>

        {/* Statistics */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6"
          >
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-blue-600">{stats.totalBookings}</div>
              <div className="text-sm text-gray-600">Total Bookings</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-green-600">{stats.totalUsers}</div>
              <div className="text-sm text-gray-600">Total Users</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-purple-600">{stats.totalIdentities}</div>
              <div className="text-sm text-gray-600">Verified IDs</div>
            </div>
            <div className="bg-white p-4 rounded-lg shadow">
              <div className="text-2xl font-bold text-orange-600">{stats.totalCheckins}</div>
              <div className="text-sm text-gray-600">Check-ins</div>
            </div>
          </motion.div>
        )}

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="bg-white rounded-lg shadow p-6 mb-6"
        >
          <h2 className="text-xl font-semibold mb-4">Search Bookings</h2>
          <div className="flex flex-col sm:flex-row gap-4">
            <select
              value={searchType}
              onChange={(e) => setSearchType(e.target.value as 'reference' | 'phone' | 'date')}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="reference">Reference + Last Name</option>
              <option value="phone">Phone Number</option>
              <option value="date">Date (YYYY-MM-DD)</option>
            </select>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                searchType === 'reference' ? 'ABC123 Smith' :
                searchType === 'phone' ? '+306912345678' :
                '2024-12-25'
              }
              className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
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
            className="bg-red-100 border border-red-300 text-red-700 px-4 py-3 rounded mb-6"
          >
            {error}
          </motion.div>
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
              <p className="mt-4 text-gray-600">Loading bookings...</p>
            </div>
          ) : bookings.length === 0 ? (
            <div className="bg-white rounded-lg shadow p-8 text-center">
              <div className="text-6xl mb-4">📭</div>
              <h3 className="text-xl font-semibold text-gray-700 mb-2">No Bookings Found</h3>
              <p className="text-gray-600">
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
                className="bg-white rounded-lg shadow p-6"
              >
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-xl font-semibold text-gray-900">
                      Booking {booking.booking.reference || booking.booking.id}
                    </h3>
                    <p className="text-gray-600">
                      {booking.booking.startDate} to {booking.booking.endDate}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className={`px-3 py-1 rounded-full text-sm ${
                      booking.checkin 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {booking.checkin ? 'Checked In' : 'Pending'}
                    </span>
                    <button
                      onClick={() => exportBooking(booking.booking.id)}
                      className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-sm hover:bg-blue-200"
                    >
                      Export
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div>
                    <h4 className="font-medium text-gray-700">Guest Info</h4>
                    <p className="text-sm text-gray-600">📱 {booking.user.phone}</p>
                    <p className="text-sm text-gray-600">📧 {booking.user.email || 'Not provided'}</p>
                    <p className="text-sm text-gray-600">🌍 {booking.user.countryOrigin}</p>
                  </div>
                  <div>
                    <h4 className="font-medium text-gray-700">Booking Details</h4>
                    <p className="text-sm text-gray-600">📄 Source: {booking.booking.source}</p>
                    <p className="text-sm text-gray-600">🆔 IDs: {booking.identities.length} verified</p>
                    <p className="text-sm text-gray-600">📝 Created: {new Date(booking.booking.createdAt).toLocaleDateString()}</p>
                  </div>
                  {booking.checkin && (
                    <div>
                      <h4 className="font-medium text-gray-700">Check-in</h4>
                      <p className="text-sm text-gray-600">⏰ {booking.checkin.arrivalTime}</p>
                      {booking.checkin.specialRequests && (
                        <p className="text-sm text-gray-600">💬 {booking.checkin.specialRequests}</p>
                      )}
                    </div>
                  )}
                </div>

                {booking.identities.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-gray-200">
                    <h4 className="font-medium text-gray-700 mb-2">Verified Documents</h4>
                    <div className="flex flex-wrap gap-2">
                      {booking.identities.map((identity, i) => (
                        <span
                          key={i}
                          className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm"
                        >
                          {identity.type} ***{identity.last4Mask}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            ))
          )}
        </motion.div>
      </div>
    </div>
  )
}