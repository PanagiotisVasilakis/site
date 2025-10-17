# Issue Resolution: Prisma Test Command Hanging

## Problem Report

**Command that was hanging:**

```bash
cd /home/pvs/site && NODE_ENV=test npx tsx -e "import { prisma } from './src/lib/prisma'; async function run(){ try { const user=await prisma.user.create({ data:{ id: 'test', phoneE164:'+123', countryOrigin:'GR', email:null, passwordHash:null }}); console.log(user); } finally { await prisma.\$disconnect(); } } run().catch((err)=>{ console.error(err); });"
```

**Symptoms:**
- Command would start and log: `[INFO] Initialized in-memory Prisma client for tests`
- Then hang indefinitely without completing
- No error messages, just silence

## Root Causes

### 1. Minor Issue: Invalid UUID

The command tried to insert `id: 'test'`, but the Prisma schema defines `id` as:

```prisma
id String @id @db.Uuid
```

This maps to PostgreSQL's `UUID` type, which requires a valid UUID format like:
- `'123e4567-e89b-12d3-a456-426614174000'`
- Or generated via `randomUUID()` from Node's crypto module

### 2. Major Issue: pg-mem Incompatibility with Prisma v6

The core problem was **@prisma/adapter-pg version 6.17.1 is fundamentally incompatible with pg-mem 3.0.5**.

#### Technical Details

- **pg-mem**: In-memory PostgreSQL emulator with callback-based API
- **@prisma/adapter-pg v6**: Expects promise-based PostgreSQL client API
- **Conflict**: When Prisma tries to execute queries:
  1. The adapter calls `client.connect()` and `pool.query()` without callbacks
  2. pg-mem expects callbacks for these methods
  3. Even with monkey-patching to wrap callbacks in Promises, queries still hang
  4. Root cause: Prisma's query engine waits for protocol-level responses that pg-mem doesn't properly emulate

#### Investigation Steps Taken

1. ✅ Verified pg-mem can create tables and insert data directly
2. ✅ Patched `connect()` to return Promises instead of requiring callbacks
3. ✅ Patched `query()` to return Promises
4. ❌ Queries still hung - the Prisma client never receives responses
5. 🔍 Discovered: Even minimal `PrismaClient + PrismaPg + pg-mem` setup hangs on any query

## Solution Implemented

### Changed Architecture

**Before:** In-memory pg-mem database (broken)
**After:** Real PostgreSQL test database (working)

### Files Modified

1. **`src/lib/prisma.ts`**
   - Removed all pg-mem setup code (~120 lines)
   - Removed monkey-patching for connect() and query()
   - Simplified `createTestPrismaClient()` to use real PostgreSQL
   - Now reads `TEST_DATABASE_URL` environment variable

2. **Created `docker-compose.test-db.yml`**
   - PostgreSQL 16 Alpine container
   - Port 5433 (avoids conflict with default 5432)
   - Performance optimized for tests (fsync off, etc.)
   - Health checks for reliability

3. **Created `scripts/setup-test-db.sh`**
   - Automated test database setup
   - Starts Docker container
   - Runs Prisma migrations
   - Sets environment variables

4. **Created Documentation**
   - `docs/TEST_DATABASE_SETUP.md`: Full setup guide
   - `docs/TEST_DATABASE_QUICK_START.md`: Quick reference

### How to Use Now

```bash
# Option 1: With Docker
docker-compose -f docker-compose.test-db.yml up -d
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Option 2: With local PostgreSQL
createdb site_test
export TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/site_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Run your command (with valid UUID!)
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npx tsx -e "
import { randomUUID } from 'crypto';
import { prisma } from './src/lib/prisma';

async function run() {
  try {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),  // ✅ Now uses valid UUID
        phoneE164: '+123',
        countryOrigin: 'GR',
        email: null,
        passwordHash: null
      }
    });
    console.log('✅ User created:', user);
  } finally {
    await prisma.\$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ Error:', err);
  process.exit(1);
});
"
```

## Benefits of New Approach

### Advantages

- ✅ **No more hangs**: Queries execute immediately
- ✅ **Production parity**: Tests use same database type as production
- ✅ **Full feature support**: All PostgreSQL features work
- ✅ **Reliable**: No adapter compatibility issues
- ✅ **Debuggable**: Can inspect test database directly with psql
- ✅ **CI/CD ready**: Easy to set up in GitHub Actions, etc.

### Trade-offs

- ⚠️ **Requires setup**: Need Docker or PostgreSQL installed
- ⚠️ **Slightly slower**: Real database vs in-memory (but more reliable)
- ⚠️ **State management**: Need to clean up between tests

## Lessons Learned

1. **In-memory databases have limitations**: While convenient, they may not support all features of real databases

2. **Adapter compatibility matters**: Major version changes (Prisma v5 → v6) can break integrations

3. **Test with real dependencies when possible**: Tests that use real databases are more reliable and catch more bugs

4. **Document breaking changes**: Created comprehensive docs to help future developers

## Migration Path for Existing Tests

If you have existing tests using pg-mem:

1. **Update test setup** to start real PostgreSQL (Docker or local)
2. **Set TEST_DATABASE_URL** in test environment
3. **Add database cleanup** between tests if needed
4. **Update CI/CD** to include PostgreSQL service

Example cleanup between tests:

```typescript
afterEach(async () => {
  // Clean up test data
  await prisma.user.deleteMany();
  await prisma.booking.deleteMany();
  // etc.
});
```

## References

- **Prisma Issue Tracker**: Similar issues reported with pg-mem + Prisma v6
- **pg-mem GitHub**: Known limitations with complex protocol requirements
- **@prisma/adapter-pg**: Designed for real PostgreSQL, not emulators

## Status: ✅ RESOLVED

The test database setup is now working. Tests can proceed with a real PostgreSQL instance.
