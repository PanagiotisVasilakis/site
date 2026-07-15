import { defineConfig } from 'prisma/config';

import { guardedPrismaDatabaseUrl } from './tests/integration/support/prisma-config-safety';

const testDatabaseUrl = guardedPrismaDatabaseUrl();

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: testDatabaseUrl,
  },
});
