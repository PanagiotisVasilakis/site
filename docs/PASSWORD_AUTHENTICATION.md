# Password-Based Authentication System

## Overview

This document describes the complete password-based authentication system implemented for the guest portal. The system provides a secure, user-friendly way for guests to sign up and sign in using only their phone number and password.

## Key Features

### 1. **Simplified Sign-In Flow**

- **Requirements**: Only phone number + password
- **No AFM/Passport needed**: Guests don't need to re-enter identity documents every time
- **Fast access**: Quick authentication for returning users

### 2. **Complete Sign-Up Flow**

- **Requirements**: Phone number + password + origin (Greece/Abroad) + AFM or Passport + Full Name
- **One-time setup**: Identity documents only needed during initial registration
- **Optional booking info**: Booking reference and email are optional

### 3. **Enhanced Security**

- **bcrypt password hashing**: Industry-standard password encryption with salt rounds = 10
- **Minimum password length**: 8 characters enforced both client and server-side
- **Password visibility toggle**: Users can show/hide password while typing
- **Remember Me**: 30-day refresh token vs 1-day session for security balance

## Technical Implementation

### Backend Changes

#### 1. **Data Store** (`src/lib/guestDataStore.ts`)

```typescript
export interface User {
  id: string;
  email?: string;
  phone_e164: string;
  password_hash?: string; // bcrypt hash
  country_origin: 'GR' | 'ABROAD';
  created_at: number;
  updated_at: number;
}
```

**New Methods:**

- `updateUserPassword(user_id, password_hash)`: Updates user's password hash

**Storage:**

- Password hash is stored in encrypted JSON file (`secure-data.enc.json`)
- bcrypt hashes are already cryptographically secure, so no additional encryption needed
- Phone numbers remain encrypted with AES-GCM

#### 2. **API Endpoint** (`src/app/api/portal/verify/route.ts`)

**New Schemas:**

```typescript
// Sign-in: ONLY phone and password
const signInSchema = z.object({
  mode: z.literal('signin'),
  phone: phoneE164,
  password: passwordSchema,
  remember: z.boolean().optional(),
});

// Sign-up: all fields + password
const signUpSchemaGR = baseSignUpSchema.extend({
  mode: z.literal('signup'),
  origin: z.literal('GR'),
  afm: z.string().regex(/^\d{9}$/),
  phone: phoneE164,
  password: passwordSchema,
  lastName: z.string().trim().min(1).max(100).optional(),
  bookingRef: z.string().trim().min(3).max(64).optional(),
  remember: z.boolean().optional(),
});
```

**Sign-In Flow:**

1. Find user by phone number
2. Check if user exists and has password hash
3. Verify password using `bcrypt.compare()`
4. Find eligible booking for user
5. Issue JWT session token
6. If Remember Me: issue 30-day refresh token
7. Redirect to check-in page

**Sign-Up Flow:**

1. Check if phone number already registered
2. Hash password with bcrypt (10 salt rounds)
3. Create or update user with password hash
4. Store identity (AFM or Passport)
5. Link or create booking
6. Grant access
7. Issue JWT session + optional refresh token
8. Redirect to check-in page

**Error Handling:**

- `UNAUTHORIZED`: Invalid phone/password combination
- `CONFLICT`: Phone number already registered (during sign-up)
- Field-specific errors for validation failures

### Frontend Changes

#### **UI Component** (`src/app/[locale]/guest/UnifiedGuestClient.tsx`)

**State Management:**

```typescript
const [password, setPassword] = useState('');
const [showPassword, setShowPassword] = useState(false);
```

**Conditional Rendering:**

- **Sign-In Mode**:
  - Phone number input
  - Password input with show/hide toggle
  - Remember Me checkbox
  - Submit button

- **Sign-Up Mode**:
  - Origin selection (Greece 🇬🇷 / World 🌍)
  - Phone number input
  - Password input with show/hide toggle
  - AFM (Greece) or Passport (Abroad)
  - Full Name
  - Optional: Booking Reference, Email
  - Remember Me checkbox
  - Submit button

**Form Validation:**

```typescript
const isFormValid = (): boolean => {
  // Sign-in: only phone and password required
  if (mode === 'signin') {
    return phone.length > 0 && password.length >= 8;
  }
  // Sign-up: all fields required
  if (!origin || !phone || !fullName || !password || password.length < 8) return false;
  if (origin === 'GR' && !validateAfm(afm)) return false;
  if (origin === 'ABROAD' && !validatePassport(passport)) return false;
  return true;
};
```

**API Request:**

```typescript
const base: Record<string, unknown> = {
  mode, // 'signin' or 'signup'
  phone: phoneE164,
  password,
  remember,
};

// Sign-up mode: include additional fields
if (mode === 'signup') {
  base.origin = origin === 'GR' ? 'GR' : 'ABROAD';
  if (origin === 'GR') base.afm = afm;
  if (origin === 'ABROAD') base.passport = passport;
  base.lastName = fullName;
  if (bookingRef) base.bookingRef = bookingRef;
}
```

## User Experience Flow

### Sign-Up (First Time)

1. User clicks "Sign up" tab
2. Selects origin (Greece or World)
3. Enters phone number with country code
4. Creates password (min 8 characters)
5. Enters AFM (Greece) or Passport (Abroad)
6. Enters full name
7. Optionally expands "Additional Information" for booking reference
8. Checks "Remember me" for 30-day session
9. Submits form
10. Redirected to check-in page

### Sign-In (Returning Users)

1. User clicks "Sign in" tab (default)
2. Enters phone number
3. Enters password
4. Checks "Remember me" for 30-day session
5. Submits form
6. Immediately redirected to check-in page

**No origin selection, No AFM/Passport, No name required!**

## Security Considerations

### Password Security

- **bcrypt**: Adaptive hash function with configurable work factor
- **Salt rounds**: Set to 10 (2^10 = 1024 iterations)
- **Timing attacks**: bcrypt automatically handles constant-time comparison
- **Rainbow tables**: Salt is unique per password, preventing rainbow table attacks

### Session Management

- **Short sessions**: 1-day expiry by default
- **Long sessions**: 30-day refresh token with Remember Me
- **HttpOnly cookies**: Session tokens not accessible to JavaScript
- **Secure flag**: HTTPS-only in production
- **Refresh token rotation**: Old tokens revoked when rotated

### Remember Me Feature

```typescript
if (body.remember) {
  const issued = guestStore.issueRefreshToken(user.id, 30); // 30 days
  const rtCookie = createRefreshCookie(issued.token);
  res.cookies.set(rtCookie.name, rtCookie.value, rtCookie.options);
}
```

**Benefits:**

- Users stay signed in for 30 days
- Refresh token can renew session without re-authentication
- Token family tracking prevents token reuse attacks
- Device and IP hints for security auditing

## Error Messages

### Sign-In Errors

- **Invalid phone/password**: "Invalid phone number or password"
  - Field hint: "No account found with this phone number" or "Incorrect password"
- **No booking**: "No active booking found for this account"

### Sign-Up Errors

- **Account exists**: "Account already exists with this phone number"
  - Suggestion: "This phone number is already registered. Please sign in instead."
- **Password too short**: "Password must be at least 8 characters"
- **Invalid AFM**: "AFM must be exactly 9 digits (0-9)"
- **Invalid passport**: "Passport must be 5-20 alphanumeric characters"

### General Errors

- Clear field identification: "❌ Problem with: [Field Name]"
- Helpful hints: Examples and format requirements
- Retry button: Easy error recovery

## Testing Checklist

- [x] Sign up with new phone number + password
- [x] Sign up creates bcrypt password hash
- [x] Sign up with existing phone number shows error
- [x] Sign in with correct phone + password succeeds
- [x] Sign in with wrong password fails with clear error
- [x] Sign in with non-existent phone fails
- [x] Password show/hide toggle works
- [x] Password validation (min 8 chars) works client-side
- [x] Password validation works server-side
- [x] Remember Me creates 30-day refresh token
- [x] Session persists across page refreshes
- [x] Sign-in mode only shows phone + password fields
- [x] Sign-up mode shows all required fields
- [x] Origin selection only shown in sign-up mode

## Migration Notes

### For Existing Users

- Existing users **without password_hash** can still sign up
- First sign-up with their phone will add password to their account
- Future sign-ins will only require phone + password

### Data Migration

No migration script needed! The system handles both cases:

1. **New users**: Create account with password during sign-up
2. **Existing users**: Add password to existing account on first sign-up

### Backward Compatibility

- Old identity-based verification still works during sign-up
- AFM/Passport verified and stored during sign-up
- Sign-in simplified to phone + password only

## Future Enhancements

### Potential Features

1. **Password reset**: Email/SMS-based password recovery
2. **Password strength meter**: Visual feedback on password strength
3. **Two-factor authentication**: Optional 2FA via SMS
4. **Social login**: Google/Facebook OAuth integration
5. **Biometric auth**: Fingerprint/Face ID for mobile users
6. **Account settings**: Allow users to change password
7. **Login history**: Show recent sign-in activity

### Security Improvements

1. **Rate limiting**: Prevent brute-force attacks
2. **Account lockout**: Temporary lockout after failed attempts
3. **Password complexity**: Require mix of characters
4. **Password history**: Prevent password reuse
5. **Session revocation**: Allow users to sign out all devices

## Support & Troubleshooting

### Common Issues

**"Invalid phone number or password"**

- Check phone number format includes country code
- Verify password is correct (use show/hide toggle)
- Try sign-up if this is your first time

**"Account already exists"**

- You've already registered with this phone
- Use sign-in instead of sign-up
- Contact support if you forgot your password

**"Password must be at least 8 characters"**

- Enter a longer password
- Use a mix of letters, numbers, and symbols
- Consider using a password manager

### Developer Notes

- Password hashes are stored in `secure-data.enc.json`
- Use `guestStore.updateUserPassword()` to change passwords
- bcrypt comparison is async: always `await bcrypt.compare()`
- Never log or expose password hashes

## Conclusion

The password-based authentication system provides:
✅ **Simplified sign-in**: Just phone + password
✅ **Secure storage**: bcrypt hashing with salts
✅ **Better UX**: No need to re-enter identity documents
✅ **Remember Me**: Long-term sessions for convenience
✅ **Clear errors**: Helpful messages for users
✅ **Backward compatible**: Works with existing data

This system balances security with user experience, making it easy for guests to access their check-in information while maintaining strong authentication standards.
