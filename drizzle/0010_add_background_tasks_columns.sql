-- Migration: Add missing columns to background_tasks and github_webhook_configs
-- Adds to background_tasks: priority, progress tracking fields, workflow orchestration fields
-- Adds to github_webhook_configs: workflow_id

ALTER TABLE "background_tasks"
  ADD COLUMN IF NOT EXISTS "priority" text NOT NULL DEFAULT 'NORMAL',
  ADD COLUMN IF NOT EXISTS "last_activity" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "current_activity" text,
  ADD COLUMN IF NOT EXISTS "tool_call_count" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "input_tokens" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "output_tokens" integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "workflow_run_id" text,
  ADD COLUMN IF NOT EXISTS "workflow_step_name" text,
  ADD COLUMN IF NOT EXISTS "depends_on_task_ids" jsonb,
  ADD COLUMN IF NOT EXISTS "task_output" text;

ALTER TABLE "github_webhook_configs"
  ADD COLUMN IF NOT EXISTS "workflow_id" text;
