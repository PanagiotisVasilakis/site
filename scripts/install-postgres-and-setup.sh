#!/usr/bin/env bash
set -e

echo "🚀 Setting up PostgreSQL test database..."

# Check if PostgreSQL is already installed
if command -v psql >/dev/null 2>&1; then
  echo "✅ PostgreSQL is already installed"
else
  echo "📦 Installing PostgreSQL..."
  sudo apt-get update
  sudo apt-get install -y postgresql postgresql-contrib
fi

# Start PostgreSQL
echo "▶️  Starting PostgreSQL service..."
sudo systemctl start postgresql || true
sudo systemctl enable postgresql || true

# Wait for PostgreSQL to start
sleep 2

# Create database and user
echo "👤 Creating test database and user..."
sudo -u postgres psql <<'EOF'
-- Drop existing to start fresh
DROP DATABASE IF EXISTS site_test;
DROP USER IF EXISTS testuser;

-- Create test database
CREATE DATABASE site_test;

-- Create test user
CREATE USER testuser WITH PASSWORD 'testpass';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE site_test TO testuser;
EOF

# Connect to site_test and grant schema permissions
sudo -u postgres psql -d site_test <<'EOF'
GRANT ALL ON SCHEMA public TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO testuser;
EOF

# Set environment variable
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"

# Add to shell profile if not already there
if ! grep -q "TEST_DATABASE_URL" ~/.bashrc 2>/dev/null; then
  echo '' >> ~/.bashrc
  echo '# Test database for site project' >> ~/.bashrc
  echo 'export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"' >> ~/.bashrc
  echo "✅ Added TEST_DATABASE_URL to ~/.bashrc"
else
  echo "ℹ️  TEST_DATABASE_URL already in ~/.bashrc"
fi

# Test connection
echo "🔌 Testing database connection..."
if psql "$TEST_DATABASE_URL" -c "SELECT version();" > /dev/null 2>&1; then
  echo "✅ Connection successful!"
else
  echo "❌ Connection failed. Check errors above."
  exit 1
fi

# Run migrations
echo "🔄 Running Prisma migrations..."
cd "$(dirname "$0")/.."
if DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy; then
  echo "✅ Migrations completed!"
else
  echo "⚠️  Migrations failed. You may need to run them manually."
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Setup complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Environment variable:"
echo "   TEST_DATABASE_URL=$TEST_DATABASE_URL"
echo ""
echo "🧪 Test your command now:"
echo "   source ~/.bashrc"
echo "   cd /home/pvs/site"
echo "   NODE_ENV=test npx tsx -e \\"
echo "     'import { randomUUID } from \"crypto\"; \\"
echo "      import { prisma } from \"./src/lib/prisma\"; \\"
echo "      prisma.user.create({ data: { id: randomUUID(), \\"
echo "      phoneE164: \"+123\", countryOrigin: \"GR\", \\"
echo "      email: null, passwordHash: null }}).then(u => { \\"
echo "      console.log(\"User:\", u); return prisma.\$disconnect(); });'"
echo ""
echo "💡 Restart your terminal or run: source ~/.bashrc"
echo ""
