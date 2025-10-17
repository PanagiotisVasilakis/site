# Test Database - Quick Reference

## ⚠️ Important Change

**pg-mem is incompatible with Prisma v6** - queries hang indefinitely. Tests now use a real PostgreSQL database.

## 🚀 Quick Setup Options

### Option 1: Docker (If Docker is installed and running)

```bash
# Start test database
docker-compose -f docker-compose.test-db.yml up -d

# Run setup script
./scripts/setup-test-db.sh

# Or manually:
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

### Option 2: Local PostgreSQL (Without Docker)

```bash
# Create test database
createdb site_test

# Set environment
export TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/site_test"

# Run migrations
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

### Option 3: Use Existing DATABASE_URL (⚠️ Not Recommended)

```bash
# Will use DATABASE_URL as fallback (ensure it's a test database!)
NODE_ENV=test npm test
```

## ✅ Test Your Original Command

```bash
# Set test database URL
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"

# Test user creation (with valid UUID!)
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npx tsx -e "
import { randomUUID } from 'crypto';
import { prisma } from './src/lib/prisma';

async function run() {
  try {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),  // ✅ Valid UUID
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

## 📝 Key Changes

### What Was Wrong

1. **Invalid UUID**: `id: 'test'` is not a valid UUID format
2. **pg-mem Incompatibility**: `@prisma/adapter-pg` v6 hangs with pg-mem - queries never complete

### What Was Fixed

1. **Real Database**: Now uses actual PostgreSQL instead of pg-mem
2. **Valid UUIDs**: Use `randomUUID()` or proper UUID strings
3. **Environment Variable**: `TEST_DATABASE_URL` for dedicated test database

## 🔧 Troubleshooting

### Command still hangs?

- Check database is running: `psql $TEST_DATABASE_URL -c "SELECT 1"`
- Verify migrations: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate status`
- Check connection: `echo $TEST_DATABASE_URL`

### "DATABASE_URL env var missing"?

Set `TEST_DATABASE_URL` or `DATABASE_URL`:
```bash
export TEST_DATABASE_URL="postgresql://user:pass@host:port/database"
```

### Docker not available?

Use local PostgreSQL (Option 2 above) or install Docker:

- Ubuntu: `sudo apt-get install docker.io docker-compose`
- Mac: Install Docker Desktop
- Windows: Install Docker Desktop or WSL2 + Docker

## 📚 Full Documentation

See [TEST_DATABASE_SETUP.md](./TEST_DATABASE_SETUP.md) for complete documentation including:

- Detailed setup instructions
- CI/CD configuration
- Database management
- Migration guide from pg-mem
- Troubleshooting tips

## 💡 Summary

**Before (Broken)**:
```typescript
id: 'test'  // ❌ Invalid UUID
// pg-mem causes hangs with Prisma v6
```

**After (Working)**:
```typescript
id: randomUUID()  // ✅ Valid UUID
// Real PostgreSQL database
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
```
