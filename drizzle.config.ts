import { defineConfig } from "drizzle-kit";

/**
 * Drizzle Kit Configuration — Multi-Driver Support
 *
 * Automatically selects the correct database driver based on environment:
 * - Postgres: When DATABASE_URL is set (works with both local and remote)
 * - SQLite: When DATABASE_URL is not set (local/desktop environments)
 *
 * For Postgres, drizzle-kit will use the `postgres` package which supports
 * both local (localhost) and remote (Neon) connections, unlike
 * `@neondatabase/serverless` which only works with WebSocket connections.
 */

const databaseUrl = process.env.DATABASE_URL;
const usePostgres = !!databaseUrl;

export default defineConfig({
  schema: usePostgres ? "./src/core/db/schema.ts" : "./src/core/db/sqlite-schema.ts",
  out: usePostgres ? "./drizzle" : "./drizzle-sqlite",
  dialect: usePostgres ? "postgresql" : "sqlite",
  dbCredentials: usePostgres
    ? { url: databaseUrl }
    : { url: process.env.SQLITE_DB_PATH ?? "routa.db" },
});
