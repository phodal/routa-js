#!/usr/bin/env tsx
/**
 * Apply schedules table migration to Postgres
 */
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const sql = neon(databaseUrl);

async function migrate() {
  await sql`
    CREATE TABLE IF NOT EXISTS "schedules" (
      "id" text PRIMARY KEY NOT NULL,
      "name" text NOT NULL,
      "cron_expr" text NOT NULL,
      "task_prompt" text NOT NULL,
      "agent_id" text NOT NULL,
      "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
      "enabled" boolean NOT NULL DEFAULT true,
      "last_run_at" timestamp with time zone,
      "next_run_at" timestamp with time zone,
      "last_task_id" text,
      "prompt_template" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    )
  `;
  console.log("Created schedules table");

  await sql`
    CREATE INDEX IF NOT EXISTS "schedules_workspace_idx"
      ON "schedules" ("workspace_id")
  `;
  console.log("Created index: schedules_workspace_idx");

  await sql`
    CREATE INDEX IF NOT EXISTS "schedules_enabled_next_run_idx"
      ON "schedules" ("enabled", "next_run_at")
  `;
  console.log("Created index: schedules_enabled_next_run_idx");

  console.log("Migration complete!");
}

migrate().catch((e) => {
  console.error("Migration failed:", e.message);
  process.exit(1);
});
