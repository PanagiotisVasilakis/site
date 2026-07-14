import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

if (nodeEnv === "development") {
  dotenv.config({ path: ".env.development.local" });
  dotenv.config({ path: ".env.local" });
} else if (nodeEnv === "production") {
  dotenv.config({ path: ".env.production.local" });
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config({ path: ".env.test.local" });
  dotenv.config({ path: ".env.test" });
}
dotenv.config({ path: ".env" });

const datasourceUrl = nodeEnv === "test"
  ? process.env.TEST_DATABASE_URL
  : process.env.DIRECT_URL ?? process.env.DATABASE_URL;

if (nodeEnv === "test" && datasourceUrl) {
  const databaseName = new URL(datasourceUrl).pathname.replace(/^\//, "");
  if (!databaseName.endsWith("_test")) {
    throw new Error("Refusing Prisma test operation: database name must end with _test");
  }
}

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl ?? "",
  },
});
