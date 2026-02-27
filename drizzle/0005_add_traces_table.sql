CREATE TABLE "traces" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"workspace_id" text,
	"event_type" text NOT NULL,
	"version" text DEFAULT '0.1.0' NOT NULL,
	"contributor" jsonb NOT NULL,
	"tool" jsonb,
	"files" jsonb,
	"conversation" jsonb,
	"vcs" jsonb,
	"metadata" jsonb,
	"timestamp" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "traces_session_id_idx" ON "traces" ("session_id");
--> statement-breakpoint
CREATE INDEX "traces_workspace_id_idx" ON "traces" ("workspace_id");
--> statement-breakpoint
CREATE INDEX "traces_timestamp_idx" ON "traces" ("timestamp");
