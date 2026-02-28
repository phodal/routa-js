CREATE TABLE IF NOT EXISTS "background_tasks" (
  "id" text PRIMARY KEY NOT NULL,
  "title" text NOT NULL,
  "prompt" text NOT NULL,
  "agent_id" text NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'PENDING',
  "triggered_by" text NOT NULL DEFAULT 'user',
  "trigger_source" text NOT NULL DEFAULT 'manual',
  "result_session_id" text,
  "error_message" text,
  "attempts" integer NOT NULL DEFAULT 0,
  "max_attempts" integer NOT NULL DEFAULT 1,
  "started_at" timestamp with time zone,
  "completed_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "background_tasks_workspace_status_idx"
  ON "background_tasks" ("workspace_id", "status");

CREATE INDEX IF NOT EXISTS "background_tasks_status_created_idx"
  ON "background_tasks" ("status", "created_at");
