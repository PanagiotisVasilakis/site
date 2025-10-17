# PostgreSQL Installation and Test Database Setup

## Quick Commands for Ubuntu/Debian

### Install PostgreSQL

```bash
# Update package list
sudo apt-get update

# Install PostgreSQL
sudo apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL service
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Verify installation
sudo systemctl status postgresql
```

### Setup Test Database (Option A: Dedicated Test User)

```bash
# Switch to postgres user and create test database
sudo -u postgres createdb site_test

# Create test user with password
sudo -u postgres psql <<EOF
CREATE USER testuser WITH PASSWORD 'testpass';
GRANT ALL PRIVILEGES ON DATABASE site_test TO testuser;
\c site_test
GRANT ALL ON SCHEMA public TO testuser;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO testuser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO testuser;
EOF

# Set environment variable (add to ~/.bashrc to make permanent)
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"
echo 'export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"' >> ~/.bashrc

# Test connection
psql "$TEST_DATABASE_URL" -c "SELECT version();"
```

### Setup Test Database (Option B: Use Your User - Simpler)

```bash
# Create PostgreSQL role for your user
sudo -u postgres createuser -s $(whoami)

# Create test database
createdb site_test

# Set environment variable
export TEST_DATABASE_URL="postgresql://$(whoami)@localhost:5432/site_test"
echo "export TEST_DATABASE_URL=\"postgresql://$(whoami)@localhost:5432/site_test\"" >> ~/.bashrc

# Test connection
psql site_test -c "SELECT version();"
```

### Run Prisma Migrations

```bash
cd /home/pvs/site

# Load environment variable
source ~/.bashrc

# Run migrations
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

# Verify tables were created
psql "$TEST_DATABASE_URL" -c "\dt"
```

### Test Your Original Command

```bash
cd /home/pvs/site

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

## All-in-One Setup Script

```bash
#!/bin/bash
set -e

echo "🚀 Setting up PostgreSQL test database..."

# Install PostgreSQL
echo "📦 Installing PostgreSQL..."
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib

# Start PostgreSQL
echo "▶️  Starting PostgreSQL service..."
sudo systemctl start postgresql
sudo systemctl enable postgresql

# Wait for PostgreSQL to start
sleep 2

# Create database and user
echo "👤 Creating test database and user..."
sudo -u postgres psql <<EOF
-- Create test database
DROP DATABASE IF EXISTS site_test;
CREATE DATABASE site_test;

-- Create test user
DROP USER IF EXISTS testuser;
CREATE USER testuser WITH PASSWORD 'testpass';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE site_test TO testuser;
\c site_test
GRANT ALL ON SCHEMA public TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO testuser;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO testuser;
EOF

# Set environment variable
export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"

# Add to shell profile if not already there
if ! grep -q "TEST_DATABASE_URL" ~/.bashrc; then
  echo 'export TEST_DATABASE_URL="postgresql://testuser:testpass@localhost:5432/site_test"' >> ~/.bashrc
  echo "✅ Added TEST_DATABASE_URL to ~/.bashrc"
fi

# Test connection
echo "🔌 Testing database connection..."
psql "$TEST_DATABASE_URL" -c "SELECT version();" > /dev/null && echo "✅ Connection successful!"

# Run migrations
echo "🔄 Running Prisma migrations..."
cd /home/pvs/site
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate deploy

echo ""
echo "✅ Setup complete!"
echo ""
echo "📝 Environment variable set:"
echo "   TEST_DATABASE_URL=$TEST_DATABASE_URL"
echo ""
echo "🧪 To run tests:"
echo "   NODE_ENV=test TEST_DATABASE_URL=\"\$TEST_DATABASE_URL\" npm test"
echo ""
echo "💡 Restart your terminal or run: source ~/.bashrc"
```

Save this as `scripts/install-postgres-and-setup.sh` and run:

```bash
chmod +x scripts/install-postgres-and-setup.sh
./scripts/install-postgres-and-setup.sh
```

## Troubleshooting

### PostgreSQL not starting

```bash
sudo systemctl status postgresql
sudo journalctl -xeu postgresql
```

### Permission denied

```bash
# Ensure your user has sudo access
sudo -v

# Or use Option B (your user as superuser)
```

### Connection refused

```bash
# Check if PostgreSQL is running
sudo systemctl status postgresql

# Check if listening on port 5432
sudo netstat -tlnp | grep 5432

# Try local connection
psql -U postgres
```

### Migrations fail

```bash
# Check database exists
psql -U testuser -d site_test -c "SELECT 1;"

# Check permissions
psql "$TEST_DATABASE_URL" -c "\du"

# Reset database and try again
sudo -u postgres dropdb site_test
sudo -u postgres createdb site_test
sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE site_test TO testuser;"
```
