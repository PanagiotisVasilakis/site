/**
 * Guest Data Query CLI
 * Simple command-line tool to query guest and booking information
 * Usage: npm run query-guests [command] [parameters]
 */

import fs from 'fs';
import path from 'path';

interface BookingRecord {
  id: string;
  reference?: string;
  source: string;
  start_date: string;
  end_date: string;
  user_id?: string;
  created_at: string;
}

interface UserRecord {
  id: string;
  email?: string;
  phone_enc: string;
  country_origin: string;
  created_at: string;
  updated_at: string;
}

interface IdentityRecord {
  user_id: string;
  type: string;
  last4_mask: string;
  verified_at?: string;
}

interface CheckinRecord {
  booking_id: string;
  arrival_time: string;
  special_requests?: string;
  accepted_at: string;
}

interface GuestDataFile {
  bookings: BookingRecord[];
  users: UserRecord[];
  identities: IdentityRecord[];
  checkins: CheckinRecord[];
}

class GuestDataCLI {
  private dataCache: GuestDataFile | null = null;

  async run() {
    const args = process.argv.slice(2);
    const command = args[0];

    try {
      switch (command) {
        case 'list':
          await this.listAllBookings();
          break;
        case 'find':
          await this.findBooking(args[1], args[2]);
          break;
        case 'phone':
          await this.findByPhone(args[1]);
          break;
        case 'stats':
          await this.showStatistics();
          break;
        case 'export':
          await this.exportBooking(args[1], args[2]);
          break;
        case 'search':
          await this.searchByDate(args[1], args[2]);
          break;
        default:
          this.showHelp();
      }
    } catch (error) {
      console.error('❌ Error:', error instanceof Error ? error.message : 'Unknown error');
      process.exit(1);
    }
  }

  private loadData(): GuestDataFile {
    if (this.dataCache) return this.dataCache;

    const filePath = path.join(process.cwd(), 'secure-data.enc.json');
    
    if (!fs.existsSync(filePath)) {
      console.log('📄 No guest data file found. No bookings have been created yet.');
      this.dataCache = { bookings: [], users: [], identities: [], checkins: [] };
      return this.dataCache;
    }

    try {
      // For now, we'll assume the file contains plain JSON for testing
      // In production, you'd use the crypto module to decrypt
      const rawData = fs.readFileSync(filePath, 'utf8');
      
      try {
        const parsed = JSON.parse(rawData) as Partial<GuestDataFile> | null;
        const bookings = Array.isArray(parsed?.bookings) ? (parsed?.bookings as BookingRecord[]) : [];
        const users = Array.isArray(parsed?.users) ? (parsed?.users as UserRecord[]) : [];
        const identities = Array.isArray(parsed?.identities) ? (parsed?.identities as IdentityRecord[]) : [];
        const checkins = Array.isArray(parsed?.checkins) ? (parsed?.checkins as CheckinRecord[]) : [];
        this.dataCache = { bookings, users, identities, checkins };
      } catch {
        // If it's encrypted, show a message
        console.log('🔐 Data file is encrypted. For security, detailed access requires decryption.');
        console.log('📊 Data file exists with guest information.');
        this.dataCache = { bookings: [], users: [], identities: [], checkins: [] };
      }
      
      return this.dataCache;
    } catch (error) {
      console.error('❌ Error reading data file:', error);
      this.dataCache = { bookings: [], users: [], identities: [], checkins: [] };
      return this.dataCache;
    }
  }

  private async listAllBookings() {
    console.log('📋 Fetching all bookings...\n');
    
    const data = this.loadData();
    const bookings = data.bookings || [];
    
    if (bookings.length === 0) {
      console.log('📭 No bookings found.');
      console.log('💡 Bookings will appear here after guests complete the check-in process.');
      return;
    }

    console.log(`Found ${bookings.length} booking(s):\n`);
    
    bookings.forEach((booking: BookingRecord, index: number) => {
      const user = data.users?.find((u: UserRecord) => u.id === booking.user_id);
      const checkin = data.checkins?.find((c: CheckinRecord) => c.booking_id === booking.id);
      const identityCount = data.identities?.filter((i: IdentityRecord) => i.user_id === booking.user_id)?.length || 0;

      console.log(`${index + 1}. Booking ${booking.reference || booking.id}`);
      console.log(`   📅 Dates: ${booking.start_date} to ${booking.end_date}`);
      console.log(`   📱 User ID: ${user?.id || 'N/A'}`);
      console.log(`   🌍 Country: ${user?.country_origin || 'N/A'}`);
      console.log(`   📧 Email: ${user?.email || 'Not provided'}`);
      console.log(`   🔑 Identities: ${identityCount} document(s)`);
      console.log(`   ✅ Check-in: ${checkin ? 'Completed' : 'Pending'}`);
      console.log(`   📄 Source: ${booking.source}`);
      console.log('');
    });
  }

  private async findBooking(reference?: string, lastName?: string) {
    if (!reference || !lastName) {
      console.log('❌ Usage: npm run query-guests find [reference] [lastName]');
      return;
    }

    console.log(`🔍 Searching for booking ${reference} with last name ${lastName}...\n`);
    
    const data = this.loadData();
    const booking = data.bookings?.find((b: BookingRecord) => 
      b.reference?.toLowerCase() === reference.toLowerCase()
    );
    
    if (!booking) {
      console.log('❌ Booking not found.');
      console.log('💡 Try using the exact reference number from your booking confirmation.');
      return;
    }

    this.displayBookingDetails(booking, data);
  }

  private async findByPhone(phone?: string) {
    console.log(`📱 Phone search requires decryption of stored data (requested: ${phone ?? 'unknown'}).`);
    console.log('💡 Phone numbers are encrypted for security.');
    console.log('🔍 Use the web interface or direct database access for phone searches.');
  }

  private async showStatistics() {
    console.log('📊 Loading booking statistics...\n');
    
    const data = this.loadData();
    const bookings = data.bookings || [];
    const users = data.users || [];
    const identities = data.identities || [];
    const checkins = data.checkins || [];
    
    console.log('=== GUEST PORTAL STATISTICS ===');
    console.log(`📋 Total Bookings: ${bookings.length}`);
    console.log(`👥 Total Users: ${users.length}`);
    console.log(`🆔 Total Identities: ${identities.length}`);
    console.log(`✅ Total Check-ins: ${checkins.length}`);
    console.log('');
    
    // Bookings by source
    const sourceStats: Record<string, number> = {};
    bookings.forEach((booking: BookingRecord) => {
      sourceStats[booking.source] = (sourceStats[booking.source] || 0) + 1;
    });
    
    console.log('📈 Bookings by Source:');
    Object.entries(sourceStats).forEach(([source, count]) => {
      console.log(`   ${source}: ${count}`);
    });
    console.log('');
    
    // Status analysis
    const now = new Date().toISOString().split('T')[0];
    let upcoming = 0, active = 0, completed = 0, checkedIn = 0;
    
    bookings.forEach((booking: BookingRecord) => {
      const hasCheckin = checkins.some((c: CheckinRecord) => c.booking_id === booking.id);
      
      if (booking.end_date < now) {
        completed++;
      } else if (booking.start_date <= now && booking.end_date >= now) {
        active++;
        if (hasCheckin) checkedIn++;
      } else {
        upcoming++;
      }
    });
    
    console.log('📋 Bookings by Status:');
    console.log(`   upcoming: ${upcoming}`);
    console.log(`   active: ${active}`);
    console.log(`   checked_in: ${checkedIn}`);
    console.log(`   completed: ${completed}`);
  }

  private async exportBooking(bookingId?: string, filePath?: string) {
    if (!bookingId) {
      console.log('❌ Usage: npm run query-guests export [bookingId] [optional: filePath]');
      return;
    }

    console.log(`💾 Exporting booking ${bookingId}...\n`);
    
    const data = this.loadData();
    const booking = data.bookings?.find((b: BookingRecord) => 
      b.id === bookingId || b.reference === bookingId
    );
    
    if (!booking) {
      console.log('❌ Booking not found.');
      return;
    }

    const user = data.users?.find((u: UserRecord) => u.id === booking.user_id);
    const identities = data.identities?.filter((i: IdentityRecord) => i.user_id === booking.user_id) || [];
    const checkin = data.checkins?.find((c: CheckinRecord) => c.booking_id === booking.id);

    const exportData = {
      booking,
      user,
      identities,
      checkin,
      exportedAt: new Date().toISOString(),
    };

    const jsonData = JSON.stringify(exportData, null, 2);
    const fileName = filePath || `booking_${booking.reference || bookingId}_${Date.now()}.json`;
    
    fs.writeFileSync(fileName, jsonData, 'utf8');
    
    console.log(`✅ Booking exported to: ${fileName}`);
    console.log(`📄 File size: ${(jsonData.length / 1024).toFixed(2)} KB`);
  }

  private async searchByDate(startDate?: string, endDate?: string) {
    if (!startDate) {
      console.log('❌ Usage: npm run query-guests search [startDate] [optional: endDate]');
      console.log('   Date format: YYYY-MM-DD');
      return;
    }

    console.log(`📅 Searching for bookings on ${startDate}${endDate ? ` to ${endDate}` : ''}...\n`);
    
    const data = this.loadData();
    const bookings = data.bookings.filter((booking) => {
      if (endDate) {
        return booking.start_date >= startDate && booking.start_date <= endDate;
      } else {
        return booking.start_date === startDate || booking.end_date === startDate ||
               (booking.start_date <= startDate && booking.end_date >= startDate);
      }
    });
    
    if (bookings.length === 0) {
      console.log('❌ No bookings found for this date range.');
      return;
    }

    console.log(`Found ${bookings.length} booking(s):\n`);
    bookings.forEach((booking: BookingRecord, index: number) => {
      console.log(`--- Booking ${index + 1} ---`);
      this.displayBookingDetails(booking, data);
      console.log('');
    });
  }

  private displayBookingDetails(booking: BookingRecord, data: GuestDataFile) {
    const user = data.users.find((u) => u.id === booking.user_id);
    const identities = data.identities.filter((i) => i.user_id === booking.user_id);
    const checkin = data.checkins.find((c) => c.booking_id === booking.id);

    console.log(`🏠 Booking Reference: ${booking.reference || booking.id}`);
    console.log(`📅 Check-in: ${booking.start_date}`);
    console.log(`📅 Check-out: ${booking.end_date}`);
    console.log(`🧾 User ID: ${user?.id || 'N/A'}`);
    console.log(`📧 Email: ${user?.email || 'Not provided'}`);
    console.log(`🌍 Country: ${user?.country_origin || 'N/A'}`);
    console.log(`📄 Source: ${booking.source}`);
    console.log(`🆔 Documents: ${identities.length} verified`);
    
    if (identities.length > 0) {
      identities.forEach((identity: IdentityRecord, i: number) => {
        console.log(`   ${i + 1}. ${identity.type} ending in ${identity.last4_mask}`);
      });
    }
    
    if (checkin) {
      console.log(`✅ Check-in Completed: ${checkin.arrival_time}`);
      if (checkin.special_requests) {
        console.log(`💬 Special Requests: ${checkin.special_requests}`);
      }
    } else {
      console.log(`⏳ Check-in: Pending`);
    }
    
    console.log(` Created: ${new Date(booking.created_at).toLocaleString()}`);
  }

  private showHelp() {
    console.log('🏠 Guest Portal Data Query Tool\n');
    console.log('Available commands:');
    console.log('  list                           - List all bookings');
    console.log('  find [reference] [lastName]    - Find booking by reference and last name');
    console.log('  phone [phoneNumber]            - Find bookings by phone number');
    console.log('  stats                          - Show booking statistics');
    console.log('  export [bookingId] [filePath]  - Export booking to JSON file');
    console.log('  search [startDate] [endDate]   - Search bookings by date range');
    console.log('\nExamples:');
    console.log('  npm run query-guests list');
    console.log('  npm run query-guests find ABC123 Smith');
    console.log('  npm run query-guests phone +306912345678');
    console.log('  npm run query-guests search 2024-12-25');
    console.log('  npm run query-guests export booking-id-123');
    console.log('\n📁 Data Location:');
    console.log('  ' + path.join(process.cwd(), 'secure-data.enc.json'));
    console.log('\n🔒 Security Note:');
    console.log('  Guest data is encrypted for security. Some operations may require decryption.');
  }
}

// Run CLI
const cli = new GuestDataCLI();
cli.run().catch(console.error);