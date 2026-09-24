import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

const nodeEnv = process.env.NODE_ENV ?? "development";

if (nodeEnv === "production") {
  dotenv.config({ path: ".env.production.local" });
  dotenv.config({ path: ".env.production" });
} else {
  dotenv.config({ path: ".env.development.local" });
  dotenv.config({ path: ".env.local" });
  dotenv.config({ path: ".env.development" });
}
dotenv.config({ path: ".env" });

// Optional DIRECT_URL (e.g. a non-pooled connection) takes precedence for Prisma CLI commands only.
const datasourceUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    url: datasourceUrl ?? "",
  },
});
