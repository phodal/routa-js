CREATE TABLE "acp_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text,
	"cwd" text NOT NULL,
	"workspace_id" text NOT NULL,
	"routa_agent_id" text,
	"provider" text,
	"role" text,
	"mode_id" text,
	"first_prompt_sent" boolean DEFAULT false,
	"message_history" jsonb DEFAULT '[]'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"model_tier" text DEFAULT 'SMART' NOT NULL,
	"workspace_id" text NOT NULL,
	"parent_id" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "event_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"agent_name" text NOT NULL,
	"event_types" jsonb NOT NULL,
	"exclude_self" boolean DEFAULT true NOT NULL,
	"one_shot" boolean DEFAULT false NOT NULL,
	"wait_group_id" text,
	"priority" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"role" text NOT NULL,
	"content" text NOT NULL,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL,
	"tool_name" text,
	"tool_args" text,
	"turn" integer
);
--> statement-breakpoint
CREATE TABLE "notes" (
	"id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"title" text NOT NULL,
	"content" text DEFAULT '' NOT NULL,
	"type" text DEFAULT 'general' NOT NULL,
	"task_status" text,
	"assigned_agent_ids" jsonb,
	"parent_note_id" text,
	"linked_task_id" text,
	"custom_metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notes_workspace_id_id_pk" PRIMARY KEY("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "pending_events" (
	"id" text PRIMARY KEY NOT NULL,
	"agent_id" text NOT NULL,
	"event_type" text NOT NULL,
	"source_agent_id" text NOT NULL,
	"workspace_id" text NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skills" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"source" text NOT NULL,
	"catalog_type" text DEFAULT 'skillssh' NOT NULL,
	"files" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"license" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"installs" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"objective" text NOT NULL,
	"scope" text,
	"acceptance_criteria" jsonb,
	"verification_commands" jsonb,
	"assigned_to" text,
	"status" text DEFAULT 'PENDING' NOT NULL,
	"dependencies" jsonb DEFAULT '[]'::jsonb,
	"parallel_group" text,
	"workspace_id" text NOT NULL,
	"completion_summary" text,
	"verification_verdict" text,
	"verification_report" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"repo_path" text,
	"branch" text,
	"status" text DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notes" ADD CONSTRAINT "notes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;