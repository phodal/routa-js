-- Migration: Workspace-centric redesign
-- 1. Create codebases table
-- 2. Migrate workspace repo_path/branch data to codebases
-- 3. Create workspace_skills junction table
-- 4. Add FK constraint to acp_sessions.workspace_id
-- 5. Remove repo_path and branch from workspaces

-- Step 1: Create codebases table
CREATE TABLE IF NOT EXISTS "codebases" (
  "id" text PRIMARY KEY NOT NULL,
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "repo_path" text NOT NULL,
  "branch" text,
  "label" text,
  "is_default" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

-- Step 2: Migrate existing workspace repo data to codebases
INSERT INTO "codebases" ("id", "workspace_id", "repo_path", "branch", "label", "is_default", "created_at", "updated_at")
SELECT
  'cb-' || "id",
  "id",
  "repo_path",
  "branch",
  "title",
  true,
  "created_at",
  "updated_at"
FROM "workspaces"
WHERE "repo_path" IS NOT NULL AND "repo_path" != '';

-- Step 3: Create workspace_skills junction table
CREATE TABLE IF NOT EXISTS "workspace_skills" (
  "workspace_id" text NOT NULL REFERENCES "workspaces"("id") ON DELETE CASCADE,
  "skill_id" text NOT NULL REFERENCES "skills"("id") ON DELETE CASCADE,
  "installed_at" timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY ("workspace_id", "skill_id")
);

-- Step 4: Remove repo_path and branch from workspaces
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "repo_path";
ALTER TABLE "workspaces" DROP COLUMN IF EXISTS "branch";
