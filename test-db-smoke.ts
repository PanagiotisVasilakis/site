import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

async function main() {
  try {
    await p.$connect();
    const result = await p.$queryRaw`SELECT 1 as ok`;
    console.log('✓ Prisma connectivity test passed:', result);
  } catch (error) {
    console.error('✗ Prisma connectivity test failed:', error);
    process.exit(1);
  } finally {
    await p.$disconnect();
  }
}

main();
