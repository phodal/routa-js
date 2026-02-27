CREATE TABLE `codebases` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`repo_path` text NOT NULL,
	`branch` text,
	`label` text,
	`is_default` integer DEFAULT false NOT NULL,
	`source_type` text,
	`source_url` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspace_skills` (
	`workspace_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`installed_at` integer NOT NULL,
	PRIMARY KEY(`workspace_id`, `skill_id`),
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_acp_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`cwd` text NOT NULL,
	`workspace_id` text NOT NULL,
	`routa_agent_id` text,
	`provider` text,
	`role` text,
	`mode_id` text,
	`model` text,
	`first_prompt_sent` integer DEFAULT false,
	`message_history` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_acp_sessions`("id", "name", "cwd", "workspace_id", "routa_agent_id", "provider", "role", "mode_id", "model", "first_prompt_sent", "message_history", "created_at", "updated_at") SELECT "id", "name", "cwd", "workspace_id", "routa_agent_id", "provider", "role", "mode_id", "model", "first_prompt_sent", "message_history", "created_at", "updated_at" FROM `acp_sessions`;--> statement-breakpoint
DROP TABLE `acp_sessions`;--> statement-breakpoint
ALTER TABLE `__new_acp_sessions` RENAME TO `acp_sessions`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `tasks` ADD `session_id` text;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `repo_path`;--> statement-breakpoint
ALTER TABLE `workspaces` DROP COLUMN `branch`;