CREATE TABLE IF NOT EXISTS "custom_mcp_servers" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "type" text NOT NULL,
  "command" text,
  "args" jsonb,
  "url" text,
  "headers" jsonb,
  "env" jsonb,
  "enabled" boolean NOT NULL DEFAULT true,
  "workspace_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
