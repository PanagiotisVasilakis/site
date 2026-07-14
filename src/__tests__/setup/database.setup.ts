const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error('TEST_DATABASE_URL is required for the database test suite');
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, '');
if (!databaseName.endsWith('_test')) {
  throw new Error('Refusing database tests: TEST_DATABASE_URL database name must end with _test');
}

process.env.DATABASE_URL = testDatabaseUrl;
