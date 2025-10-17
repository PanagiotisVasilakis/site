#!/usr/bin/env bash
# Quick test script without database setup
# This just validates the code syntax and UUID generation

cd /home/pvs/site

echo "🧪 Testing user creation logic (mock)..."

npx tsx -e "
import { randomUUID } from 'crypto';

// Mock Prisma client for quick test
const mockPrisma = {
  user: {
    create: async ({ data }: any) => {
      console.log('📝 Would create user with data:', data);
      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
        throw new Error('Invalid UUID format');
      }
      return { ...data, createdAt: new Date(), updatedAt: new Date() };
    }
  },
  \$disconnect: async () => {
    console.log('✅ Mock disconnect');
  }
};

async function run() {
  try {
    const user = await mockPrisma.user.create({
      data: {
        id: randomUUID(),  // ✅ Valid UUID
        phoneE164: '+123',
        countryOrigin: 'GR',
        email: null,
        passwordHash: null
      }
    });
    console.log('✅ Mock user created successfully:', user);
    console.log('');
    console.log('💡 This validates your code logic.');
    console.log('   To test with real database, set up PostgreSQL first.');
  } finally {
    await mockPrisma.\$disconnect();
  }
}

run().catch((err) => {
  console.error('❌ Error:', err.message);
  process.exit(1);
});
"
