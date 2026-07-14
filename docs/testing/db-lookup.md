# Local database verification

Start the disposable PostgreSQL service:

```bash
docker compose -f docker/docker-compose.test-db.yml up -d postgres-test
docker compose -f docker/docker-compose.test-db.yml ps
```

It listens only on `127.0.0.1:5434` and stores data in tmpfs. Configure and migrate it:

```bash
export TEST_DATABASE_URL='postgresql://testuser:testpass@127.0.0.1:5434/site_test'
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npx prisma migrate deploy
```

Run the database suite and a direct SQL readiness check:

```bash
DATABASE_URL="$TEST_DATABASE_URL" DIRECT_URL="$TEST_DATABASE_URL" npm run test:db
docker compose -f docker/docker-compose.test-db.yml exec postgres-test pg_isready -U testuser -d site_test
```

If it fails, inspect container health and migration state:

```bash
docker compose -f docker/docker-compose.test-db.yml logs postgres-test
DATABASE_URL="$TEST_DATABASE_URL" npx prisma migrate status
```

Stop and discard it with:

```bash
docker compose -f docker/docker-compose.test-db.yml down
```
