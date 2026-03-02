---
title: "drizzle-kit migrate fails with ECONNREFUSED when connecting to Neon serverless"
date: 2026-03-02
status: resolved
severity: high
area: infrastructure
reported_by: GitHub Issue #50
related_issues:
  - https://github.com/phodal/routa/issues/50
---

## What Happened

Running `npm run db:migrate` (which executes `drizzle-kit migrate`) fails with a connection error in CI/CD environments:

```
DrizzleQueryError: Failed query: CREATE SCHEMA IF NOT EXISTS "drizzle"
at NeonPreparedQuery.queryWithCache (/home/runner/work/routa/routa/node_modules/src/pg-core/session.ts:73:11)
...
cause: ErrorEvent {
  ...
  Symbol(kError): AggregateError [ECONNREFUSED]:
    at internalConnectMultiple (node:net:1134:18)
    at afterConnectMultiple (node:net:1715:7) {
      code: 'ECONNREFUSED',
      [errors]: [Array]
    }
}
```

The error occurs when drizzle-kit attempts to:
1. Connect to a Neon serverless database via WebSocket (`wss://localhost/v2`)
2. Create the `drizzle` schema for migration tracking
3. Apply pending migrations

The connection attempt fails with `ECONNREFUSED`, indicating the database endpoint is unreachable.

## Why This Might Happen

### 1. DATABASE_URL Points to Localhost
The error shows `wss://localhost/v2`, suggesting the `DATABASE_URL` environment variable might be:
- Not set at all (causing drizzle-kit to use a default/fallback value)
- Set to a localhost address instead of the actual Neon serverless endpoint
- Malformed or missing required connection parameters

### 2. Neon Serverless Driver Limitation
The warning message states:
```
Warning '@neondatabase/serverless' can only connect to remote Neon/Vercel Postgres/Supabase instances through a websocket
```

This indicates:
- The `@neondatabase/serverless` driver requires a WebSocket connection
- It cannot connect to local Postgres instances
- The driver is being used in an environment where it shouldn't be (CI with local Postgres)

### 3. CI Environment Mismatch
Looking at `.github/workflows/api-schema-validation.yml` (lines 105-112), the workflow:
- Sets up a local Postgres service container
- Sets `DATABASE_URL=postgresql://routa:routa_test@localhost:5432/routa_test`
- Manually applies migrations using `psql` instead of `drizzle-kit migrate`

This suggests the project intentionally avoids using `drizzle-kit migrate` in CI because:
- The Neon serverless driver doesn't work with local Postgres
- The migration command expects a remote Neon instance
- CI uses a different migration strategy (direct SQL file execution)

### 4. Missing Environment Variable Validation
The `drizzle.config.ts` file uses `process.env.DATABASE_URL!` (non-null assertion), which:
- Assumes `DATABASE_URL` is always present
- Doesn't validate the URL format or reachability
- Doesn't provide fallback behavior for different environments

## Relevant Files

- `drizzle.config.ts` — Drizzle Kit configuration, hardcoded to use `@neondatabase/serverless` driver
- `src/core/db/index.ts` — Database connection logic with driver detection (lines 44-114)
- `.github/workflows/api-schema-validation.yml` — CI workflow that manually applies migrations (lines 105-112)
- `package.json` — Defines `db:migrate` script (line 19)
- `.env.example` — Documents expected `DATABASE_URL` format

## Context from GitHub Issue #50

The issue describes broader database reliability problems:
- Missing retry logic for transient connection failures
- No health check endpoint for monitoring
- Unclear error messages when database is misconfigured
- SQLite fallback doesn't work correctly in some scenarios

The migration failure is likely a symptom of these underlying issues, specifically:
- Lack of environment-specific configuration (CI vs production vs local dev)
- No validation that `DATABASE_URL` points to a compatible database
- Drizzle Kit configuration doesn't account for multi-driver setup

## Additional Observations

1. The project supports both Postgres (Neon) and SQLite, but `drizzle.config.ts` only configures Postgres
2. CI uses a workaround (manual `psql` execution) instead of fixing the root cause
3. The error message doesn't guide users toward resolution (e.g., "DATABASE_URL must point to a Neon serverless instance")
4. No documentation exists for running migrations in different environments

## Resolution

The issue was resolved by:
1. Updating `drizzle.config.ts` to use the `postgres` driver (via drizzle-orm) which supports both local and remote connections
2. Changing CI workflow to use `npm run db:push` instead of `npm run db:migrate`
   - `db:push` is idempotent and syncs schema directly
   - `db:migrate` executes migration files and fails if tables already exist
3. For production deployments, continue using `db:migrate` to apply versioned migrations
