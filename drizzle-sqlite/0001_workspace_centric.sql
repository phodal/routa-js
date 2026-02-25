-- Migration: Workspace-centric redesign (SQLite)

-- Step 1: Create codebases table
CREATE TABLE IF NOT EXISTS `codebases` (
  `id` text PRIMARY KEY NOT NULL,
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
  `repo_path` text NOT NULL,
  `branch` text,
  `label` text,
  `is_default` integer NOT NULL DEFAULT 0,
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS `idx_codebases_workspace_repo` ON `codebases`(`workspace_id`, `repo_path`);
CREATE INDEX IF NOT EXISTS `idx_codebases_workspace` ON `codebases`(`workspace_id`);

-- Step 2: Migrate existing workspace repo data to codebases
INSERT INTO `codebases` (`id`, `workspace_id`, `repo_path`, `branch`, `label`, `is_default`, `created_at`, `updated_at`)
SELECT
  'cb-' || `id`,
  `id`,
  `repo_path`,
  `branch`,
  `title`,
  1,
  `created_at`,
  `updated_at`
FROM `workspaces`
WHERE `repo_path` IS NOT NULL AND `repo_path` != '';

-- Step 3: Create workspace_skills junction table
CREATE TABLE IF NOT EXISTS `workspace_skills` (
  `workspace_id` text NOT NULL REFERENCES `workspaces`(`id`) ON DELETE CASCADE,
  `skill_id` text NOT NULL REFERENCES `skills`(`id`) ON DELETE CASCADE,
  `installed_at` integer NOT NULL,
  PRIMARY KEY (`workspace_id`, `skill_id`)
);

-- Step 4: Recreate workspaces without repo_path and branch (SQLite doesn't support DROP COLUMN before 3.35)
CREATE TABLE IF NOT EXISTS `workspaces_new` (
  `id` text PRIMARY KEY NOT NULL,
  `title` text NOT NULL,
  `status` text NOT NULL DEFAULT 'active',
  `metadata` text NOT NULL DEFAULT '{}',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);

INSERT INTO `workspaces_new` (`id`, `title`, `status`, `metadata`, `created_at`, `updated_at`)
SELECT `id`, `title`, `status`, `metadata`, `created_at`, `updated_at` FROM `workspaces`;

DROP TABLE `workspaces`;
ALTER TABLE `workspaces_new` RENAME TO `workspaces`;
