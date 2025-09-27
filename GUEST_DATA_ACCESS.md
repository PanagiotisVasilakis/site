# 🏠 Guest Data Access Guide

This guide shows you multiple ways to access guest and booking information stored locally on your PC.

## 📁 Data Storage Location

All guest data is securely stored in:
```
c:\Users\public.Panos\Desktop\site\secure-data.enc.json
```

This file contains encrypted information about:
- Guest bookings and reservations
- User contact information (phone, email, country)
- Identity document verification
- Check-in completion records
- Access logs

## 🔧 Access Methods

### 1. Command Line Interface (Recommended)

The easiest way to query your data is using the command line:

```powershell
# Navigate to your project directory
cd "c:\Users\public.Panos\Desktop\site"

# List all bookings
npm run query-guests list

# Find a specific booking
npm run query-guests find ABC123 Smith

# Find bookings by phone number
npm run query-guests phone +306912345678

# Search bookings by date
npm run query-guests search 2024-12-25

# Show statistics
npm run query-guests stats

# Export a booking to JSON file
npm run query-guests export booking-id-123
```

### 2. Browser Console (Quick Access)

When your development server is running:

1. Start your dev server: `npm run dev`
2. Open browser to `http://localhost:3000`
3. Open Developer Tools (F12)
4. In the Console tab, load the guest viewer:
   ```javascript
   // Load the viewer script
   const script = document.createElement('script');
   script.src = '/guest-viewer.js';
   document.head.appendChild(script);
   
   // Wait a moment, then use it:
   GuestViewer.help()           // Show help
   GuestViewer.listAll()        // List all bookings
   GuestViewer.stats()          // Show statistics
   ```

### 3. Direct File Access (Advanced)

You can also read the encrypted file directly:

```javascript
// In a Node.js script or your app
const fs = require('fs');
const { decryptJSON } = require('./src/lib/crypto');

const filePath = 'secure-data.enc.json';
const encrypted = fs.readFileSync(filePath, 'utf8');
const data = decryptJSON(encrypted);

console.log('Bookings:', data.bookings);
console.log('Users:', data.users);
console.log('Identities:', data.identities);
```

## 📊 Available Data

### Booking Information
- Booking ID and reference number
- Source (Airbnb, direct booking, etc.)
- Check-in and check-out dates
- Creation timestamp

### Guest Information
- Phone number (encrypted)
- Email address
- Country of origin
- Account creation and update times

### Identity Verification
- Document type (passport, ID card, etc.)
- Last 4 characters of document number
- Verification timestamp

### Check-in Records
- Arrival time
- Special requests
- Completion timestamp

### Access Logs
- Login attempts and successes
- Session information
- Activity timestamps

## 🔍 Query Examples

### Find Recent Bookings
```bash
npm run query-guests search 2024-12-01 2024-12-31
```

### Export Guest Data for Backup
```bash
npm run query-guests export booking-abc-123
```

### Check Statistics
```bash
npm run query-guests stats
```

### Find Guest by Phone
```bash
npm run query-guests phone "+306912345678"
```

## 📋 Command Reference

| Command | Description | Example |
|---------|-------------|---------|
| `list` | Show all bookings | `npm run query-guests list` |
| `find [ref] [name]` | Find by reference & last name | `npm run query-guests find ABC123 Smith` |
| `phone [number]` | Find by phone number | `npm run query-guests phone +306912345678` |
| `search [start] [end]` | Search by date range | `npm run query-guests search 2024-12-25` |
| `stats` | Show statistics | `npm run query-guests stats` |
| `export [id] [path]` | Export to JSON file | `npm run query-guests export booking-123` |

## 🔒 Security Notes

- All sensitive data is encrypted at rest
- Phone numbers are encrypted with additional security
- Only you can access this data locally
- No data is sent to external servers
- Backup the `secure-data.enc.json` file regularly

## 📁 Export Formats

When you export data, you get a comprehensive JSON file with:

```json
{
  "booking": {
    "id": "booking-123",
    "reference": "ABC123",
    "source": "airbnb",
    "startDate": "2024-12-25",
    "endDate": "2024-12-27",
    "createdAt": "2024-12-01T10:00:00Z"
  },
  "user": {
    "id": "user-456",
    "email": "guest@example.com",
    "phone": "+306912345678",
    "countryOrigin": "GR",
    "createdAt": "2024-12-01T10:00:00Z"
  },
  "identities": [...],
  "access": [...],
  "checkin": {...}
}
```

## 🆘 Troubleshooting

### "Command not found" error
```bash
# Make sure you're in the right directory
cd "c:\Users\public.Panos\Desktop\site"

# Install dependencies if needed
npm install
```

### "No bookings found" 
- Check if guests have actually completed check-in
- Verify the secure-data.enc.json file exists
- Try with different search parameters

### Permission errors
- Run PowerShell as Administrator if needed
- Check file permissions on secure-data.enc.json

## 🔄 Data Backup

To backup your guest data:

1. **File backup**: Copy `secure-data.enc.json` to a safe location
2. **Export backup**: Use the export command for each booking
3. **Statistics backup**: Save the output of `npm run query-guests stats`

Example backup script:
```bash
# Create backup directory
mkdir guest-backups

# Copy encrypted file
copy secure-data.enc.json guest-backups\

# Export statistics
npm run query-guests stats > guest-backups\statistics.txt
```

This ensures you always have access to your guest information locally and securely!