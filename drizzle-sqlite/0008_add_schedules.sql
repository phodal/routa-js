-- Migration: Add Scheduled Cron Triggers table (SQLite)
-- schedules: stores user-configured cron-based agent trigger rules

CREATE TABLE IF NOT EXISTS "schedules" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "cron_expr" text NOT NULL,
  "task_prompt" text NOT NULL,
  "agent_id" text NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "enabled" integer NOT NULL DEFAULT 1,
  "last_run_at" integer,
  "next_run_at" integer,
  "last_task_id" text,
  "prompt_template" text,
  "created_at" integer NOT NULL,
  "updated_at" integer NOT NULL
);

CREATE INDEX IF NOT EXISTS "schedules_workspace_idx"
  ON "schedules" ("workspace_id");

CREATE INDEX IF NOT EXISTS "schedules_enabled_next_run_idx"
  ON "schedules" ("enabled", "next_run_at");
