# Check-In Page UI Improvements

## Overview
Updated the House Guide (Check-In) page with improved design, removed unnecessary sections, and added configurable check-in/check-out times for hosts.

## Changes Implemented

### 1. **Welcome Message - Black Text in Light Mode** ✅
**Location**: `src/components/CheckInInfo.tsx`

**Before**: Welcome section had white text on gradient background in both light and dark modes
**After**: Black text in light mode, white text in dark mode for better readability

```tsx
<section className="card p-6 bg-gradient-to-br from-[color:var(--brand-primary)] to-[color:var(--brand-secondary)]">
  <h2 className="text-2xl font-bold mb-2 text-gray-900 dark:text-white">
    🎉 Welcome to Our Villa!
  </h2>
  <p className="text-gray-800 dark:text-white/90">
    We're delighted to have you here...
  </p>
</section>
```

**Design Rationale**:
- Light mode: `text-gray-900` (nearly black) for optimal contrast
- Dark mode: `text-white` maintains existing design
- Gradient background remains the same for visual appeal

---

### 2. **Removed Emergency Contacts Section** ✅
**Location**: `src/components/CheckInInfo.tsx`

**Removed Section**:
- 🚨 Emergency Contacts card
- Host contact (24/7)
- Emergency Services (112)
- Local Hospital details

**Reason**: Simplified the page to focus on essential house guide information

---

### 3. **Page Title Changed to "House Guide"** ✅
**Location**: `src/app/[locale]/check-in/page.tsx`

**Changes**:
- Title: "Check-in Information" → "House Guide"
- Added center alignment for title
- Maintains subtitle for context

```tsx
<div className="mb-6 text-center">
  <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-accent)' }}>
    House Guide
  </h1>
  <p className="text-[color:var(--fg-muted)]">
    Everything you need to know for your stay
  </p>
</div>
```

---

### 4. **Configurable Check-In/Out Times** ✅
**Locations**: 
- Frontend: `src/components/CheckInInfo.tsx`
- Backend API: `src/app/api/check-in/preferences/route.ts`
- Storage: `checkin-preferences.enc.json` (encrypted)

#### **Features**:

**a) Edit Button (Host Only)**
- "✏️ Edit" button appears next to "Check-in & Check-out" title
- Only accessible to users with admin API key
- Switches time display to editable time inputs

**b) Time Inputs**
- HTML5 time inputs for both check-in and check-out
- Format: HH:MM (24-hour format)
- Visual feedback with larger font and borders

**c) Save & Cancel Actions**
- "✓ Save Times" button (green)
  - Prompts for admin API key
  - Validates and saves to encrypted storage
  - Shows success message for 3 seconds
- "✗ Cancel" button (gray)
  - Reverts changes without saving
  - Returns to view mode

**d) Success Feedback**
```tsx
{timesSaved && (
  <div className="mb-4 p-3 rounded-lg bg-green-100 dark:bg-green-900/20 text-green-800 dark:text-green-200 text-sm">
    ✓ Check-in times saved successfully!
  </div>
)}
```

---

## Backend Implementation

### API Endpoint: `/api/check-in/preferences`

#### **GET Request** (Public - loads preferences)
```typescript
GET /api/check-in/preferences

Response:
{
  "success": true,
  "data": {
    "checkInTime": "15:00",
    "checkOutTime": "11:00",
    "updatedAt": 1696258800000
  }
}
```

**Usage**: Automatically called when CheckInInfo component mounts

#### **POST Request** (Admin Only - saves preferences)
```typescript
POST /api/check-in/preferences
Headers:
  Content-Type: application/json
  x-api-key: YOUR_ADMIN_API_KEY

Body:
{
  "checkInTime": "14:00",
  "checkOutTime": "12:00"
}

Response:
{
  "success": true,
  "data": {
    "message": "Check-in preferences updated successfully",
    "preferences": {
      "checkInTime": "14:00",
      "checkOutTime": "12:00",
      "updatedAt": 1696258900000
    }
  }
}
```

**Security**:
- Requires valid API key in `x-api-key` header
- Validates against `VALID_API_KEYS` environment variable
- Uses `createAPISecurityMiddleware({ requireAPIKey: true })`

**Validation**:
```typescript
const preferencesSchema = z.object({
  checkInTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-in time must be in HH:MM format'),
  checkOutTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Check-out time must be in HH:MM format'),
});
```

Accepts:
- Valid 24-hour time format: HH:MM
- Hours: 00-23
- Minutes: 00-59

Examples:
- ✅ "09:00", "15:30", "23:45"
- ❌ "25:00", "9:0", "15:60"

---

## Data Storage

### File: `checkin-preferences.enc.json`
**Location**: Project root directory  
**Encryption**: AES-GCM (same encryption used for guest data)

**Structure**:
```typescript
interface CheckInPreferences {
  checkInTime: string;    // "15:00"
  checkOutTime: string;   // "11:00"
  updatedAt: number;      // Unix timestamp
}
```

**Default Values**:
```json
{
  "checkInTime": "15:00",
  "checkOutTime": "11:00",
  "updatedAt": 1696258800000
}
```

**Storage Functions**:
```typescript
function readPreferences(): CheckInPreferences
function writePreferences(prefs: CheckInPreferences): void
```

**Error Handling**:
- If file doesn't exist: returns default values
- If decryption fails: returns default values
- Automatic file creation on first save

---

## User Flows

### Guest View (Default)
1. Guest signs in and navigates to House Guide
2. Check-in/out times are loaded from `/api/check-in/preferences`
3. Times are displayed in large, bold text
4. "✏️ Edit" button is visible but requires API key

### Host Edit Flow
1. Host clicks "✏️ Edit" button
2. Time displays switch to time input fields
3. Host adjusts check-in time (e.g., "15:00" → "14:00")
4. Host adjusts check-out time (e.g., "11:00" → "12:00")
5. Host clicks "✓ Save Times"
6. Browser prompts: "Enter admin API key to save preferences:"
7. Host enters API key
8. System validates and saves to encrypted storage
9. Success message appears: "✓ Check-in times saved successfully!"
10. View returns to normal display with updated times

### Cancel Flow
1. Host clicks "✏️ Edit"
2. Makes changes to times
3. Clicks "✗ Cancel"
4. Changes are discarded
5. Original times are restored
6. Returns to view mode

---

## Frontend State Management

```typescript
// Time values
const [checkInTime, setCheckInTime] = useState('15:00');
const [checkOutTime, setCheckOutTime] = useState('11:00');

// Temporary values during editing
const [tempCheckInTime, setTempCheckInTime] = useState('15:00');
const [tempCheckOutTime, setTempCheckOutTime] = useState('11:00');

// UI state
const [isEditingTimes, setIsEditingTimes] = useState(false);
const [savingTimes, setSavingTimes] = useState(false);
const [timesSaved, setTimesSaved] = useState(false);
```

**State Flow**:
1. **Initial Load**: Fetch from API → Update all time states
2. **Edit Mode**: Copy current times to temp states
3. **Save**: API call → Update current times from temp → Exit edit mode
4. **Cancel**: Restore temp states from current times → Exit edit mode

---

## Security Considerations

### API Key Protection
- API key required for POST requests only
- GET requests are public (read-only)
- Key validated against `VALID_API_KEYS` environment variable
- Failed authentication returns 401 Unauthorized

### User Prompt
```typescript
const apiKey = prompt('Enter admin API key to save preferences:');
if (!apiKey) {
  setSavingTimes(false);
  return;
}
```

**Pros**:
- Simple implementation
- No complex auth UI needed
- Clear separation between host and guest actions

**Cons**:
- API key visible during entry (use careful environment)
- Consider password input field for production

**Future Enhancement**:
Replace `prompt()` with a proper modal with password-masked input

### Data Encryption
- Preferences stored in encrypted JSON file
- Same encryption method as guest data (`encryptJSON`)
- AES-GCM encryption standard
- Automatic encryption on save, decryption on read

---

## Error Handling

### Frontend Errors
```typescript
try {
  const res = await internalFetch('/api/check-in/preferences', {
    method: 'POST',
    headers: { 'x-api-key': apiKey },
    body: JSON.stringify({ checkInTime, checkOutTime }),
  });

  if (!res.ok) {
    const error = await res.json();
    alert(`Failed to save: ${error.error?.message || 'Unknown error'}`);
  }
} catch (error) {
  console.error('Failed to save preferences:', error);
  alert('Failed to save preferences. Please try again.');
}
```

**Error Messages**:
- Invalid API key: "Failed to save: Unauthorized"
- Invalid time format: "Failed to save: Check-in time must be in HH:MM format"
- Network error: "Failed to save preferences. Please try again."

### Backend Errors
- `400 Bad Request`: Invalid time format (Zod validation)
- `401 Unauthorized`: Missing or invalid API key
- `500 Internal Server Error`: File system or encryption errors

---

## Testing

### Manual Testing Checklist

**Visual Changes**:
- [x] Welcome message text is black in light mode
- [x] Welcome message text is white in dark mode
- [x] Emergency Contacts section is removed
- [x] Page title shows "House Guide"
- [x] Title is center-aligned

**Time Configuration**:
- [x] Default times load correctly (15:00 / 11:00)
- [x] "✏️ Edit" button appears next to title
- [x] Clicking Edit shows time input fields
- [x] Time inputs accept valid HH:MM format
- [x] Cancel button reverts changes
- [x] Save button prompts for API key
- [x] Invalid API key shows error
- [x] Valid API key saves successfully
- [x] Success message appears for 3 seconds
- [x] Saved times persist after page refresh

### API Testing

**GET Request** (no auth required):
```bash
curl http://localhost:3000/api/check-in/preferences
```

**POST Request** (requires API key):
```bash
curl -X POST http://localhost:3000/api/check-in/preferences \
  -H "Content-Type: application/json" \
  -H "x-api-key: YOUR_API_KEY_HERE" \
  -d '{
    "checkInTime": "14:00",
    "checkOutTime": "12:00"
  }'
```

---

## Environment Setup

### Required Environment Variables

Add to `.env.local`:
```bash
# Admin API Keys (comma-separated for multiple keys)
VALID_API_KEYS=your-secret-key-here,another-key-if-needed

# Existing variables...
ADMIN_DASH_SECRET=...
ADMIN_JWT_SECRET=...
```

**Generate Secure API Key**:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Example output: `xK2jP9vLmN4qR7sT1uW3yZ5aB8cD0eF6gH9iJ1kL2mN4oP7qR9sT`

---

## Future Enhancements

### Potential Features
1. **Rich Modal for API Key Entry**
   - Replace `prompt()` with styled modal
   - Password-masked input field
   - Better UX with proper validation feedback

2. **Admin Dashboard**
   - Dedicated admin page for all settings
   - Persistent admin login (not per-action)
   - Multiple preference categories

3. **Time Zone Support**
   - Display times in guest's local timezone
   - Store times with timezone info
   - Automatic timezone detection

4. **Multiple Time Slots**
   - Early check-in option
   - Late check-out option
   - Seasonal time variations

5. **Notification System**
   - Email host when times are updated
   - Audit log of preference changes
   - Guest notification of updated times

6. **Validation Enhancements**
   - Ensure check-out > check-in
   - Warn if times are unusual (e.g., 3:00 AM)
   - Business logic: minimum gap between times

---

## Troubleshooting

### "Failed to save: Unauthorized"
**Cause**: Invalid or missing API key  
**Solution**: Check that API key matches `VALID_API_KEYS` in `.env.local`

### Times don't persist after refresh
**Cause**: API key might be incorrect, or file write failed  
**Solution**: 
1. Check server logs for errors
2. Verify `checkin-preferences.enc.json` file is created
3. Ensure proper file permissions

### "Failed to load check-in preferences"
**Cause**: Network error or API endpoint not responding  
**Solution**:
1. Check that dev server is running
2. Open browser DevTools → Network tab
3. Look for failed `/api/check-in/preferences` request

### Time inputs not working on mobile
**Cause**: Some mobile browsers have limited time input support  
**Solution**: Modern browsers support `<input type="time">`, but consider text input fallback for older devices

---

## Summary

All requested changes have been implemented:

✅ **Welcome message** - Black text in light mode, white in dark mode  
✅ **Emergency Contacts** - Removed from House Guide  
✅ **Page Title** - Changed to "House Guide" with center alignment  
✅ **Configurable Times** - Editable check-in/out with secure API storage

**Key Benefits**:
- Cleaner, more focused House Guide page
- Host can customize check-in/out times
- Secure admin-only editing
- Encrypted storage for preferences
- Instant updates visible to all guests
- Professional UI with proper feedback

**Files Modified**:
1. `src/components/CheckInInfo.tsx` - UI changes and time editing
2. `src/app/[locale]/check-in/page.tsx` - Title update
3. `src/app/api/check-in/preferences/route.ts` - New API endpoint

**New Files Created**:
- `checkin-preferences.enc.json` - Encrypted preferences storage (auto-created)

The system is ready to use! 🎉
