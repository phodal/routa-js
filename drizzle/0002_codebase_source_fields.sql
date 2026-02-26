-- Migration: Add source_type and source_url columns to codebases table
ALTER TABLE "codebases" ADD COLUMN IF NOT EXISTS "source_type" text;
ALTER TABLE "codebases" ADD COLUMN IF NOT EXISTS "source_url" text;
