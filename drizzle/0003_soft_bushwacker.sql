CREATE TABLE "codebases" (
	"id" text PRIMARY KEY NOT NULL,
	"workspace_id" text NOT NULL,
	"repo_path" text NOT NULL,
	"branch" text,
	"label" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"source_type" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_skills" (
	"workspace_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"installed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_skills_workspace_id_skill_id_pk" PRIMARY KEY("workspace_id","skill_id")
);
--> statement-breakpoint
ALTER TABLE "acp_sessions" ADD COLUMN "model" text;--> statement-breakpoint
ALTER TABLE "codebases" ADD CONSTRAINT "codebases_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_skills" ADD CONSTRAINT "workspace_skills_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_skills" ADD CONSTRAINT "workspace_skills_skill_id_skills_id_fk" FOREIGN KEY ("skill_id") REFERENCES "public"."skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "acp_sessions" ADD CONSTRAINT "acp_sessions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "repo_path";--> statement-breakpoint
ALTER TABLE "workspaces" DROP COLUMN "branch";