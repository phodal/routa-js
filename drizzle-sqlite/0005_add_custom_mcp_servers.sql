CREATE TABLE IF NOT EXISTS `custom_mcp_servers` (
  `id` text PRIMARY KEY NOT NULL,
  `name` text NOT NULL,
  `description` text,
  `type` text NOT NULL,
  `command` text,
  `args` text,
  `url` text,
  `headers` text,
  `env` text,
  `enabled` integer NOT NULL DEFAULT 1,
  `workspace_id` text,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
