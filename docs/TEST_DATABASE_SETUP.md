# Test Database Setup

## Overview

This project uses a **real PostgreSQL database for tests** instead of an in-memory solution.

**Why?** The in-memory solution (pg-mem) is incompatible with `@prisma/adapter-pg` v6+, causing queries to hang indefinitely. Using a real PostgreSQL database ensures tests are reliable and match production behavior.

## Quick Start

### Option 1: Docker Test Database (Recommended)

1. **Start the test database:**

   ```bash
   docker-compose -f docker-compose.test-db.yml up -d
   ```

2. **Run migrations:**

   ```bash
   export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"
   DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
   ```

3. **Run tests:**

   ```bash
   NODE_ENV=test TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test" npm test
   ```

**One-Command Setup:**

```bash
./scripts/setup-test-db.sh
```

### Option 2: Existing PostgreSQL Instance

If you have a PostgreSQL instance running:

```bash
# Create test database
createdb site_test

# Set environment variable
export TEST_DATABASE_URL="postgresql://user:password@localhost:5432/site_test"

# Run migrations
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Run tests
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npm test
```

## Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `TEST_DATABASE_URL` | PostgreSQL connection string for tests (recommended) | `postgresql://testuser:testpass@localhost:5433/site_test` |
| `DATABASE_URL` | Fallback if TEST_DATABASE_URL not set (not recommended) | `postgresql://user:pass@localhost:5432/db` |

## Test Database Configuration

The Docker test database (`docker-compose.test-db.yml`):
- **Port**: 5433 (to avoid conflicts with port 5432)
- **User**: testuser
- **Password**: testpass
- **Database**: site_test
- **Performance**: Optimized for fast tests (fsync off, etc.)

## Running Your Command

Your original command now works with a valid UUID:

```bash
# Start test database
docker-compose -f docker-compose.test-db.yml up -d

# Set environment
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"

# Run migrations
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Test user creation (with valid UUID)
NODE_ENV=test TEST_DATABASE_URL="$TEST_DATABASE_URL" npx tsx -e "
import { randomUUID } from 'crypto';
import { prisma } from './src/lib/prisma';

async function run() {
  try {
    const user = await prisma.user.create({
      data: {
        id: randomUUID(),
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

## Managing Test Database

### Start

```bash
docker-compose -f docker-compose.test-db.yml up -d
```

### Stop

```bash
docker-compose -f docker-compose.test-db.yml down
```

### Reset (wipe data)

```bash
docker-compose -f docker-compose.test-db.yml down -v
docker-compose -f docker-compose.test-db.yml up -d
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

### View logs

```bash
docker-compose -f docker-compose.test-db.yml logs -f
```

## Continuous Integration

> 📘 **New!** Follow the [CI Database Testing Guide](./testing/db-lookup.md) for the end-to-end lookup smoke test that our pipeline runs before Vitest. It walks through service startup, migrations, and verification commands.

For CI/CD, add the test database to your workflow:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    env:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: site_test
    ports:
      - 5432:5432
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5

steps:
  - name: Run migrations
    env:
      TEST_DATABASE_URL: postgresql://testuser:testpass@localhost:5432/site_test
    run: |
      DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate deploy
      
  - name: Run tests
    env:
      NODE_ENV: test
      TEST_DATABASE_URL: postgresql://testuser:testpass@localhost:5432/site_test
    run: npm test
```

## Troubleshooting

### Tests hang or timeout

- Ensure the test database is running: `docker ps | grep site-test-db`
- Check TEST_DATABASE_URL is correct
- Verify migrations ran: `DATABASE_URL=$TEST_DATABASE_URL npx prisma migrate status`

### Port 5433 already in use

Change the port in `docker-compose.test-db.yml`:

```yaml
ports:
  - "5434:5432"  # Use 5434 instead
```

Then update TEST_DATABASE_URL accordingly.
rs

The string `'test'` is not a valid UUID. Always use `randomUUID()` or a properly formatted UUID string like `'123e4567-e89b-12d3-a456-426614174000'`.

## Migration from pg-mem

The old pg-mem setup has been removed due to incompatibility with Prisma v6. Key changes:

1. **Removed**: pg-mem, @prisma/adapter-pg usage with pg-mem
2. **Added**: Docker test database, setup scripts
3. **Changed**: `createTestPrismaClient()` now uses real PostgreSQL

### Benefits

- ✅ Tests no longer hang
- ✅ Better matches production environment
- ✅ Full PostgreSQL feature support
- ✅ Reliable and maintainable

### Trade-offs

- ⚠️ Requires Docker or PostgreSQL installation
- ⚠️ Slightly slower than in-memory (but more reliable)
- ⚠️ Need to manage test database lifecycle

## Additional Resources

- [Prisma Testing Guide](https://www.prisma.io/docs/guides/testing)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [PostgreSQL Docker Image](https://hub.docker.com/_/postgres)
