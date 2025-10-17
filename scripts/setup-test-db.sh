#!/usr/bin/env bash
set -e

echo "🚀 Setting up test database..."

# Start PostgreSQL test container
docker-compose -f docker-compose.test-db.yml up -d

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
timeout 30 bash -c 'until docker exec site-test-db pg_isready -U testuser -d site_test > /dev/null 2>&1; do sleep 1; done'

echo "✅ PostgreSQL is ready!"

# Set environment variable for Prisma
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5433/site_test"

# Run migrations
echo "🔄 Running migrations..."
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

echo "✅ Test database setup complete!"
echo ""
echo "📝 To use the test database, set this environment variable:"
echo "   export TEST_DATABASE_URL=\"postgresql://testuser:testpass@localhost:5433/site_test\""
echo ""
echo "🧪 To run tests:"
echo "   NODE_ENV=test TEST_DATABASE_URL=\"postgresql://testuser:testpass@localhost:5433/site_test\" npm test"
