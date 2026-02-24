CREATE TABLE `acp_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text,
	`cwd` text NOT NULL,
	`workspace_id` text NOT NULL,
	`routa_agent_id` text,
	`provider` text,
	`role` text,
	`mode_id` text,
	`first_prompt_sent` integer DEFAULT false,
	`message_history` text DEFAULT '[]',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `agents` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`role` text NOT NULL,
	`model_tier` text DEFAULT 'SMART' NOT NULL,
	`workspace_id` text NOT NULL,
	`parent_id` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `event_subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`agent_name` text NOT NULL,
	`event_types` text NOT NULL,
	`exclude_self` integer DEFAULT true NOT NULL,
	`one_shot` integer DEFAULT false NOT NULL,
	`wait_group_id` text,
	`priority` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`timestamp` integer NOT NULL,
	`tool_name` text,
	`tool_args` text,
	`turn` integer
);
--> statement-breakpoint
CREATE TABLE `notes` (
	`id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text DEFAULT '' NOT NULL,
	`type` text DEFAULT 'general' NOT NULL,
	`task_status` text,
	`assigned_agent_ids` text,
	`parent_note_id` text,
	`linked_task_id` text,
	`custom_metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `pending_events` (
	`id` text PRIMARY KEY NOT NULL,
	`agent_id` text NOT NULL,
	`event_type` text NOT NULL,
	`source_agent_id` text NOT NULL,
	`workspace_id` text NOT NULL,
	`data` text DEFAULT '{}',
	`timestamp` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`source` text NOT NULL,
	`catalog_type` text DEFAULT 'skillssh' NOT NULL,
	`files` text DEFAULT '[]' NOT NULL,
	`license` text,
	`metadata` text DEFAULT '{}',
	`installs` integer DEFAULT 0 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `tasks` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`objective` text NOT NULL,
	`scope` text,
	`acceptance_criteria` text,
	`verification_commands` text,
	`assigned_to` text,
	`status` text DEFAULT 'PENDING' NOT NULL,
	`dependencies` text DEFAULT '[]',
	`parallel_group` text,
	`workspace_id` text NOT NULL,
	`completion_summary` text,
	`verification_verdict` text,
	`verification_report` text,
	`version` integer DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`workspace_id`) REFERENCES `workspaces`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `workspaces` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`repo_path` text,
	`branch` text,
	`status` text DEFAULT 'active' NOT NULL,
	`metadata` text DEFAULT '{}',
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
