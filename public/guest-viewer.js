/* eslint-disable internal-fetch/no-internal-fetch -- browser console helper cannot import shared fetch wrapper */
/**
 * Simple Guest Data Viewer for Browser Console
 * Copy this code into your browser console on localhost to query guest data
 */

// Simple guest data viewer that works in browser console
window.GuestViewer = {
  // View all bookings
  async listAll() {
    try {
      const response = await fetch('/api/admin/guests?action=list');
      const data = await response.json();
      console.table(data.data.bookings.map(b => ({
        reference: b.booking.reference || b.booking.id,
        startDate: b.booking.startDate,
        endDate: b.booking.endDate,
        phone: b.user.phone,
        country: b.user.countryOrigin,
        checkedIn: b.checkin ? 'Yes' : 'No',
        identities: b.identities.length
      })));
      return data;
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Find booking by reference and last name
  async find(reference, lastName) {
    try {
      const response = await fetch(`/api/admin/guests?action=find&reference=${reference}&lastName=${lastName}`);
      const data = await response.json();
      console.log('Booking Details:', data.data.booking);
      return data.data.booking;
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Find bookings by phone
  async findByPhone(phone) {
    try {
      const response = await fetch(`/api/admin/guests?action=phone&phone=${encodeURIComponent(phone)}`);
      const data = await response.json();
      console.table(data.data.bookings.map(b => ({
        reference: b.booking.reference || b.booking.id,
        startDate: b.booking.startDate,
        endDate: b.booking.endDate,
        checkedIn: b.checkin ? 'Yes' : 'No'
      })));
      return data.data.bookings;
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Search by date
  async searchByDate(startDate, endDate) {
    try {
      let url = `/api/admin/guests?action=search&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      
      const response = await fetch(url);
      const data = await response.json();
      console.table(data.data.bookings.map(b => ({
        reference: b.booking.reference || b.booking.id,
        startDate: b.booking.startDate,
        endDate: b.booking.endDate,
        phone: b.user.phone,
        checkedIn: b.checkin ? 'Yes' : 'No'
      })));
      return data.data.bookings;
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Get statistics
  async stats() {
    try {
      const response = await fetch('/api/admin/guests?action=stats');
      const data = await response.json();
      console.log('Guest Portal Statistics:', data.data.statistics);
      return data.data.statistics;
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Export booking to download
  async export(bookingId) {
    try {
      const response = await fetch(`/api/admin/guests?action=export&bookingId=${bookingId}`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `booking_${bookingId}_${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      console.log('Booking exported successfully');
    } catch (error) {
      console.error('Error:', error);
    }
  },

  // Helper to show usage
  help() {
    console.log(`
🏠 Guest Portal Data Viewer

Available commands:
- GuestViewer.listAll()                    // List all bookings
- GuestViewer.find('ABC123', 'Smith')      // Find by reference & last name
- GuestViewer.findByPhone('+306912345678') // Find by phone number
- GuestViewer.searchByDate('2024-12-25')   // Search by date
- GuestViewer.stats()                      // Show statistics
- GuestViewer.export('booking-id')         // Export booking to file

Examples:
  GuestViewer.listAll()
  GuestViewer.find('ABC123', 'Smith')
  GuestViewer.findByPhone('+306912345678')
  GuestViewer.searchByDate('2024-12-25', '2024-12-31')
  GuestViewer.stats()
    `);
  }
};

// Show help on load
console.log('🏠 Guest Portal Data Viewer loaded! Type GuestViewer.help() for usage.');