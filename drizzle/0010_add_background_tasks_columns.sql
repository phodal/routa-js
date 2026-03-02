-- Migration: Add missing columns to background_tasks table
-- Adds: priority, progress tracking fields, and workflow orchestration fields

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
