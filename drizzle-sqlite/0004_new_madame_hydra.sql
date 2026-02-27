CREATE TABLE `specialists` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text DEFAULT 'user' NOT NULL,
	`role` text NOT NULL,
	`default_model_tier` text DEFAULT 'SMART' NOT NULL,
	`system_prompt` text NOT NULL,
	`role_reminder` text DEFAULT '' NOT NULL,
	`model` text,
	`enabled` integer DEFAULT true NOT NULL,
	`created_by` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
