-- Migration: Add GitHub Webhook Trigger System tables
-- github_webhook_configs: stores user-configured trigger rules
-- webhook_trigger_logs:   audit log for each received event

CREATE TABLE IF NOT EXISTS "github_webhook_configs" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "repo" text NOT NULL,
  "github_token" text NOT NULL,
  "webhook_secret" text NOT NULL DEFAULT '',
  "event_types" jsonb NOT NULL DEFAULT '[]',
  "label_filter" jsonb DEFAULT '[]',
  "trigger_agent_id" text NOT NULL,
  "workspace_id" text,
  "enabled" boolean NOT NULL DEFAULT true,
  "prompt_template" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "github_webhook_configs_repo_idx"
  ON "github_webhook_configs" ("repo");

CREATE INDEX IF NOT EXISTS "github_webhook_configs_workspace_idx"
  ON "github_webhook_configs" ("workspace_id");

CREATE TABLE IF NOT EXISTS "webhook_trigger_logs" (
  "id" text PRIMARY KEY NOT NULL,
  "config_id" text NOT NULL,
  "event_type" text NOT NULL,
  "event_action" text,
  "payload" jsonb DEFAULT '{}',
  "background_task_id" text,
  "signature_valid" boolean NOT NULL DEFAULT false,
  "outcome" text NOT NULL DEFAULT 'triggered',
  "error_message" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "webhook_trigger_logs_config_idx"
  ON "webhook_trigger_logs" ("config_id");

CREATE INDEX IF NOT EXISTS "webhook_trigger_logs_created_idx"
  ON "webhook_trigger_logs" ("created_at" DESC);
