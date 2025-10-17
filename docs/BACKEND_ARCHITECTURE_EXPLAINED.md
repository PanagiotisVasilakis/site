# 📚 Backend Architecture Explained - Simple but Comprehensive

## 🎯 The Big Picture

Your application is a **vacation rental property management system** (like a mini-Airbnb). It handles:

- Guest bookings and check-ins
- User authentication with MFA (multi-factor authentication)
- Secure data storage with encryption
- Real-time analytics and monitoring

### Architecture Overview

```
┌─────────────┐
│   Browser   │  ← User visits your site
└──────┬──────┘
       │ HTTP Request
       ↓
┌─────────────────────────────────────────────────┐
│          Next.js 15 App (Frontend + API)        │
│  ┌───────────────────────────────────────────┐  │
│  │  src/app/                                 │  │
│  │  ├── Pages (UI Components)                │  │
│  │  └── api/ (Backend API Routes)            │  │
│  └───────────────────────────────────────────┘  │
│                      ↓                           │
│  ┌───────────────────────────────────────────┐  │
│  │  src/lib/ (Business Logic)                │  │
│  │  ├── auth.ts (Authentication)             │  │
│  │  ├── prisma.ts (Database Connection)      │  │
│  │  ├── crypto.ts (Encryption)                │  │
│  │  ├── metrics-collector.ts (Monitoring)    │  │
│  │  └── logger-enterprise.ts (Logging)       │  │
│  └───────────────────────────────────────────┘  │
│                      ↓                           │
│  ┌───────────────────────────────────────────┐  │
│  │  Prisma ORM                                │  │
│  │  (Translates TypeScript ↔ SQL)            │  │
│  └───────────────────────────────────────────┘  │
└─────────────────────┬───────────────────────────┘
                      │ SQL Queries
                      ↓
         ┌────────────────────────┐
         │   PostgreSQL Database  │
         │   (Data Storage)       │
         └────────────────────────┘
```

---

## 🗄️ Database Deep Dive

### What is PostgreSQL?

PostgreSQL is your **data warehouse** - think of it like an extremely organized filing cabinet where all your application data lives permanently.

### How We Connect: The Prisma Layer

Instead of writing raw SQL (database language), you use **Prisma** - a tool that lets you work with the database using TypeScript:

```typescript
// Instead of writing SQL like this:
// "SELECT * FROM users WHERE email = 'user@example.com'"

// You write TypeScript like this:
const user = await prisma.user.findUnique({
  where: { email: 'user@example.com' }
});
```

**Why this is awesome:**

- ✅ Type-safe (catches errors at compile time)
- ✅ Autocomplete in your editor
- ✅ Easier to read and maintain
- ✅ Prevents SQL injection attacks automatically

---

## 📊 Database Schema (Your Data Structure)

Your database has **14 tables**. Let's explain each one:

### 1. **Users** - The Core Identity

```
users
├── id (UUID) ← Unique identifier for each person
├── email (optional)
├── phoneE164 (required) ← Phone in international format (+306912345678)
├── passwordHash ← Encrypted password
├── countryOrigin ← GR or ABROAD
├── createdAt ← When they joined
└── updatedAt ← Last modification
```

**Purpose**: Stores basic user information. Think of it as the "person's ID card."

**Key Design Decisions**:

- `id` is a **UUID** (looks like `123e4567-e89b-12d3-a456-426614174000`)
  - Not a simple number (1, 2, 3...) because UUIDs are:
    - Globally unique (no collisions even across systems)
    - Hard to guess (security)
    - Can be generated anywhere without coordination
- Phone is **required**, email is optional
- Passwords are **hashed** (one-way encryption - can't be reversed)

### 2. **Identities** - Verification Documents

```
identities
├── userId ← Links to the user
├── type ← AFM (Greek tax ID) or PASSPORT
├── valueHash ← Encrypted ID number
├── salt ← Random data for encryption
├── last4Mask ← Last 4 digits for display (e.g., "****1234")
└── verifiedAt ← When verified
```

**Purpose**: Stores sensitive ID information securely. Each user can have multiple identities (e.g., both AFM and passport).

**Security Feature**:

- Real ID numbers are **hashed** (encrypted one-way)
- Only stores `last4Mask` for showing users: "Your AFM ending in 1234"
- Even if database is compromised, attackers can't read the full ID

### 3. **Bookings** - Reservation Records

```
bookings
├── id (UUID)
├── source ← ONSITE or EXTERNAL (where booking came from)
├── reference ← Booking confirmation number
├── lastNameHash ← Guest's last name (encrypted)
├── lastNameSalt ← For encryption
├── lastNameToken ← Searchable version
├── lastNameTokenNoWs ← Without spaces (for search)
├── startDate ← Check-in date
├── endDate ← Check-out date
├── userId ← Who made the booking
└── createdAt
```

**Purpose**: Records when someone books your property.

**Interesting Design**:

- Last name is stored **4 ways**:
  1. `lastNameHash` - Can't be read, used for verification
  2. `lastNameToken` - Normalized for searching (e.g., "SMITH")
  3. `lastNameTokenNoWs` - Same but without spaces
  4. `lastNameSalt` - Random data for security
- This lets you search bookings without exposing real names

### 4. **Access** - Permission Bridge

```
access
├── userId ← Who
├── bookingId ← For which booking
├── status ← PENDING or VERIFIED
└── createdAt/updatedAt
```

**Purpose**: Links users to bookings. A user might have access to multiple bookings.

**Status Flow**:

1. User claims a booking → `PENDING`
2. System verifies → `VERIFIED`

### 5. **Sessions** - Login Tracking

```
sessions
├── id (UUID)
├── userId ← Who's logged in
├── bookingId ← Context of the session
├── expiresAt ← When session expires
├── revokedAt ← If manually logged out
└── createdAt
```

**Purpose**: Tracks active logins. When you log in, a session is created. When you log out or it expires, it's marked as revoked.

**Security**: Sessions expire automatically (like bank websites).

### 6. **Checkins** - Arrival Details

```
checkins
├── bookingId ← One-to-one with booking
├── arrivalTime ← When guest will arrive
├── specialRequests ← Dietary needs, early check-in, etc.
└── acceptedAt ← When check-in was submitted
```

**Purpose**: Stores guest's arrival preferences and special requests.

### 7. **RefreshTokens** - Stay Logged In

```
refresh_tokens
├── id (UUID)
├── userId
├── tokenHash ← Encrypted refresh token
├── familyId ← Groups related tokens
├── createdAt/expiresAt
├── revokedAt ← If invalidated
├── rotatedFromId ← Previous token in chain
├── lastUsedAt
└── deviceHint/ipHint ← For security monitoring
```

**Purpose**: Allows "Remember Me" functionality securely.

**How it works**:

1. Login → Get access token (short-lived, 15 min) + refresh token (long-lived, 30 days)
2. Access token expires → Use refresh token to get new access token
3. Refresh token rotates → Old one invalidated, new one issued
4. `familyId` groups all tokens from one login session
5. If token is stolen and used → All tokens in family are revoked

**Token Rotation** prevents replay attacks.

### 8. **MfaFactors** - 2FA Setup

```
mfa_factors
├── id (UUID)
├── userId
├── type ← TOTP (app), SMS, EMAIL, or BACKUP_CODE
├── secretHash ← Encrypted secret key
├── backupCodesHash ← Emergency codes
├── status ← ACTIVE, INACTIVE, PENDING
├── createdAt/activatedAt/lastUsedAt
```

**Purpose**: Stores 2-factor authentication settings.

**Types**:

- **TOTP**: Google Authenticator, Authy (generates 6-digit codes)
- **SMS**: Text message codes
- **EMAIL**: Email codes
- **BACKUP_CODE**: One-time emergency codes

### 9. **MfaChallenges** - 2FA Verification

```
mfa_challenges
├── id (UUID)
├── userId/factorId
├── challengeCodeHash ← The code to enter (encrypted)
├── expiresAt ← Code expires in 5-10 minutes
├── completedAt ← When user entered correct code
└── createdAt
```

**Purpose**: Temporary codes for 2FA verification.

**Flow**:

1. User tries to login
2. System creates challenge → Sends code
3. User enters code
4. System verifies → Marks `completedAt`
5. Challenge expires if not completed

### 10. **RateLimit** - Anti-Abuse

```
rate_limits
├── key ← Identifier (IP address, user ID, etc.)
├── count ← Number of requests
└── resetTime ← When counter resets
```

**Purpose**: Prevents abuse (e.g., password guessing, spam).

**Example**:

- Key: `login:192.168.1.1`
- Count: 5
- ResetTime: 2025-10-14 13:00:00
- Meaning: IP `192.168.1.1` has tried to log in 5 times. Resets at 1pm.

### 11. **CacheEntry** - Speed Boost

```
cache
├── key ← What to cache (e.g., "user:123:profile")
├── value ← Cached data (JSON string)
└── expiresAt ← When cache goes stale
```

**Purpose**: Store frequently accessed data in memory to avoid database queries.

**Example**:

- First request for user profile → Query database (slow)
- Cache result for 5 minutes
- Next 100 requests → Read from cache (fast!)
- After 5 minutes → Fetch fresh data

### 12. **Metrics** - Performance Tracking

```
metrics
├── id (UUID)
├── metricName ← What was measured (e.g., "api.response_time")
├── value ← The measurement (e.g., 145.2 milliseconds)
├── tags ← Extra info (JSON: {"endpoint": "/api/bookings"})
└── recordedAt ← Timestamp
```

**Purpose**: Track application performance and usage.

**Use Cases**:

- How fast are API responses?
- How many users logged in today?
- Is memory usage increasing?

### 13. **Logs** - Activity History

```
logs
├── id (UUID)
├── level ← ERROR, WARN, INFO, DEBUG
├── message ← What happened
├── meta ← Extra context (JSON)
└── timestamp
```

**Purpose**: Audit trail and debugging.

**Example Log Entry**:

```json
{
  "level": "ERROR",
  "message": "Failed to send email",
  "meta": {
    "userId": "123",
    "error": "SMTP connection timeout",
    "emailType": "booking_confirmation"
  },
  "timestamp": "2025-10-14T12:30:00Z"
}
```

### 14. **_prisma_migrations** (Special)

```
_prisma_migrations
├── id
├── checksum
├── finished_at
├── migration_name
├── logs
└── ...
```

**Purpose**: Tracks database schema changes over time. Managed automatically by Prisma.

---

## 🔄 How Data Flows Through the System

### Example: User Makes a Booking

```
1. User submits booking form
   ↓
2. Next.js API route receives request
   src/app/api/bookings/route.ts
   ↓
3. Validates input (schema validation)
   src/lib/api-validation.ts
   ↓
4. Checks authentication
   src/lib/auth.ts → Verifies session
   ↓
5. Business logic processes request
   src/lib/prisma.ts → Database operations
   ↓
6. Prisma translates TypeScript → SQL
   Example:
   prisma.booking.create({ ... })
   becomes
   INSERT INTO bookings (...) VALUES (...)
   ↓
7. PostgreSQL saves data
   ↓
8. Prisma returns result as TypeScript object
   ↓
9. API sends response to browser
   ↓
10. UI updates to show confirmation
```

---

## 🔐 Security Layers

Your system has **multiple security measures**:

### 1. **Data Encryption**

- Passwords: **Bcrypt hashed** (can't be reversed)
- Sensitive IDs (AFM, Passport): **Salted hashing**
- Tokens: **SHA-256 hashed**

### 2. **Access Control**

- Users can only see their own data
- Admin routes require special authentication
- API keys for external integrations

### 3. **Rate Limiting**

- Prevents brute force attacks
- Limits API calls per IP/user

### 4. **Session Management**

- Auto-expires after inactivity
- Revocable (can force logout)
- Token rotation prevents replay attacks

### 5. **Input Validation**

- All input is validated with Zod schemas
- SQL injection prevention (Prisma parameterizes queries)
- XSS protection (Next.js escapes output)

---

## 🏗️ The Prisma Connection Layer

### What Prisma Does

**Prisma** is the "translator" between your TypeScript code and PostgreSQL:

```typescript
// Your code (TypeScript)
const user = await prisma.user.findUnique({
  where: { email: 'guest@example.com' },
  include: {
    bookings: true,    // ← Include related bookings
    sessions: true      // ← Include active sessions
  }
});

// What Prisma generates (SQL)
SELECT 
  u.id, u.email, u.phone_e164, u.country_origin, ...
FROM users u
LEFT JOIN bookings b ON b.user_id = u.id
LEFT JOIN sessions s ON s.user_id = u.id
WHERE u.email = $1;
-- Parameters: ['guest@example.com']
```

### Prisma Features You Use

1. **Type Safety**: Autocomplete and error checking
2. **Migrations**: Automatic schema updates
3. **Relations**: Easy to join tables
4. **Transactions**: Multiple operations succeed/fail together
5. **Connection Pooling**: Reuses database connections (faster)

### The `src/lib/prisma.ts` File

This is your **database connection factory**:

```typescript
// Simplified version
export const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL  // ← Connection string
    }
  }
});

// Connection string format:
// postgresql://username:password@host:port/database
// Example: postgresql://testuser:testpass@localhost:5432/site_test
```

**Key Features**:

1. **Singleton Pattern**: Only one connection pool for entire app
2. **Environment Detection**: Uses different DB for test vs production
3. **Auto-disconnect**: Cleans up connections on shutdown
4. **Logging**: Tracks all queries for debugging

---

## 🔗 Database Relationships

### How Tables Connect

```
User (1) ──→ (Many) Bookings
  ↑                   ↑
  │                   │
  └── (Many) Access (Many) ──┘
  │
  └─→ (Many) Sessions
  │
  └─→ (Many) Identities
  │
  └─→ (Many) MfaFactors ──→ (Many) MfaC challenges

Booking (1) ──→ (1) Checkin

RefreshToken (1) ──→ (1) RefreshToken (rotation chain)
```

### Cascade Deletes

When a user is deleted, **automatically delete**:

- All their bookings
- All their sessions
- All their identities
- All their MFA factors

This prevents orphaned data.

---

## ⚡ Performance Optimizations

### 1. **Indexes**

Every table has indexes on frequently searched columns:

```sql
-- Without index: Searches entire table (slow)
SELECT * FROM users WHERE phone_e164 = '+306912345678';
-- Time: 500ms with 1 million users

-- With index: Direct lookup (fast)
CREATE INDEX idx_users_phone ON users(phone_e164);
-- Time: 5ms with 1 million users
```

Your schema has **30+ indexes** for fast lookups.

### 2. **Connection Pooling**

Instead of opening a new database connection for each request:

- Maintain a **pool** of 10-20 connections
- Reuse connections across requests
- Much faster (no connection handshake)

### 3. **Caching**

Frequently accessed data is cached:

```typescript
// First time: Query database
const user = await prisma.user.findUnique(...);  // 50ms

// Cache the result
await cache.set(`user:${id}`, user, 300);  // Cache for 5 minutes

// Next 100 requests: Read from cache
const user = await cache.get(`user:${id}`);  // 1ms
```

---

## 🧪 Test vs Production

### Two Separate Databases

**Production**: Real user data

- `DATABASE_URL=postgresql://prod_user@prod_host/prod_db`

**Test**: Temporary data for testing

- `TEST_DATABASE_URL=postgresql://testuser:testpass@localhost:5432/site_test`

### Why Separate?

1. **Safety**: Tests can't corrupt real data
2. **Speed**: Test DB can be reset/wiped anytime
3. **Isolation**: Tests run in parallel without conflicts

### Test Database Flow

```bash
# 1. Create test database
createdb site_test

# 2. Run migrations (create tables)
DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy

# 3. Run tests
NODE_ENV=test npm test

# 4. Clean up (optional)
dropdb site_test
```

---

## 📈 Monitoring & Observability

### What Gets Tracked

1. **Metrics** (Numbers):
   - API response times
   - Database query duration
   - Error rates
   - Memory usage

2. **Logs** (Events):
   - User actions (login, booking)
   - Errors and warnings
   - Security events

3. **Traces** (Request Flow):
   - How long each part of a request took
   - Which services were called
   - Where bottlenecks are

### Example Flow

```
User requests /api/bookings
  │
  ├─ [Trace] Request received (0ms)
  ├─ [Metric] api.request_count +1
  │
  ├─ [Trace] Validate authentication (5ms)
  ├─ [Metric] auth.check_time: 5ms
  │
  ├─ [Trace] Query database (25ms)
  ├─ [Metric] db.query_time: 25ms
  ├─ [Log] INFO: Retrieved 3 bookings for user123
  │
  ├─ [Trace] Format response (2ms)
  └─ [Metric] api.response_time: 32ms total
```

---

## 🚦 Request Lifecycle (Complete Flow)

### From Browser Click to Database and Back

```
1. USER CLICKS "Book Now"
   Browser sends: POST /api/bookings
   Body: { startDate: "2025-12-01", endDate: "2025-12-07", ... }

2. MIDDLEWARE (src/middleware.ts)
   ├─ Check CORS (allowed origin?)
   ├─ Apply security headers
   ├─ Generate correlation ID (for tracking)
   └─ Rate limit check

3. API ROUTE (src/app/api/bookings/route.ts)
   ├─ Extract request body
   ├─ Validate with Zod schema
   └─ Pass to handler

4. AUTHENTICATION (src/lib/auth.ts)
   ├─ Extract session cookie
   ├─ Query sessions table
   ├─ Verify not expired
   └─ Load user data

5. BUSINESS LOGIC
   ├─ Check user has access
   ├─ Validate booking dates
   ├─ Calculate pricing
   └─ Prepare booking object

6. PRISMA ORM (src/lib/prisma.ts)
   ├─ prisma.booking.create(...)
   ├─ Generate SQL query
   └─ Send to PostgreSQL

7. POSTGRESQL DATABASE
   ├─ Validate constraints
   ├─ Insert row into bookings table
   ├─ Update related tables (access, etc.)
   └─ Return inserted data

8. RESPONSE FORMATTING
   ├─ Convert to JSON
   ├─ Add metadata (timestamp, correlation ID)
   ├─ Set status code (201 Created)
   └─ Add response headers

9. SEND TO BROWSER
   Response: {
     "success": true,
     "data": { "id": "uuid", "startDate": "...", ... },
     "metadata": { "timestamp": "...", "correlationId": "..." }
   }

10. BROWSER UPDATES UI
    ├─ Parse JSON response
    ├─ Update state
    └─ Show confirmation message
```

---

## 🎓 Key Takeaways

### Database Design Principles

1. **Normalized**: No redundant data (each fact stored once)
2. **Indexed**: Fast lookups on commonly queried fields
3. **Relational**: Tables link via foreign keys (userId, bookingId)
4. **Secure**: Sensitive data is hashed/encrypted
5. **Auditable**: Timestamps track when data was created/modified

### Why This Architecture?

1. **Scalable**: Can handle thousands of users
2. **Secure**: Multiple layers of protection
3. **Maintainable**: Clear separation of concerns
4. **Observable**: Easy to debug and monitor
5. **Testable**: Can test without affecting production

### Data Flow Summary

```
User Input → Validation → Authentication → Business Logic → 
Database Query → Data Storage → Response → User Display
```

Each layer has a specific job and can be tested independently.

---

## 🔍 Common Operations Explained

### Create a User

```typescript
const user = await prisma.user.create({
  data: {
    id: randomUUID(),              // Generate unique ID
    phoneE164: '+306912345678',    // International phone format
    countryOrigin: 'GR',           // Greece
    passwordHash: await hash(password), // Encrypt password
  }
});
// SQL: INSERT INTO users (...) VALUES (...) RETURNING *;
```

### Find a Booking

```typescript
const booking = await prisma.booking.findFirst({
  where: {
    reference: 'BK12345',          // Booking confirmation number
    lastNameToken: normalizeText(lastName), // Match last name
  },
  include: {
    user: true,                    // Include user details
    checkin: true,                 // Include check-in info
  }
});
// SQL: SELECT b.*, u.*, c.* FROM bookings b
//      LEFT JOIN users u ON b.user_id = u.id
//      LEFT JOIN checkins c ON c.booking_id = b.id
//      WHERE b.reference = $1 AND b.last_name_token = $2;
```

### Update Session

```typescript
await prisma.session.update({
  where: { id: sessionId },
  data: { 
    revokedAt: new Date(),         // Mark as logged out
  }
});
// SQL: UPDATE sessions SET revoked_at = $1 WHERE id = $2;
```

### Delete with Cascade

```typescript
await prisma.user.delete({
  where: { id: userId }
});
// SQL: DELETE FROM users WHERE id = $1;
// Automatically also deletes (due to CASCADE):
// - All bookings by this user
// - All sessions
// - All identities
// - All MFA factors
```

---

## 📚 Additional Resources

### Files to Explore

1. **`prisma/schema.prisma`** - Complete database structure
2. **`src/lib/prisma.ts`** - Database connection setup
3. **`src/app/api/**/route.ts`** - API endpoints
4. **`src/lib/auth.ts`** - Authentication logic
5. **`migrations/`** - Database change history

### Key Concepts to Research

- **UUIDs** vs auto-incrementing IDs
- **Database normalization** (1NF, 2NF, 3NF)
- **Indexing strategies** and query optimization
- **ACID transactions** (Atomicity, Consistency, Isolation, Durability)
- **Connection pooling** and database performance
- **Token-based authentication** (JWT, refresh tokens)
- **Cryptographic hashing** (bcrypt, SHA-256)

---

This system is production-ready with enterprise-level security, monitoring, and performance optimizations! 🚀
