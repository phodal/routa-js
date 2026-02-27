/**
 * Skill Resolver - unified skill content resolution for ACP prompts.
 *
 * Resolves skill content from multiple sources in priority order:
 *   1. Filesystem (project .claude/skills, .agents/skills, etc.)
 *   2. Repository path (user-selected repo)
 *   3. Postgres database (Vercel serverless)
 *   4. SQLite database (desktop)
 *
 * Placed in src/core/skills/ so relative paths to ../db/* work correctly
 * for dynamic require (SQLite uses eval("require") to avoid webpack bundling).
 */

import { SkillRegistry } from "./skill-registry";
import { discoverSkillsFromPath, type SkillDefinition } from "./skill-loader";

/**
 * Resolve skill content by name, searching all available sources.
 *
 * @param skillName - The skill name (e.g. "frontend-design")
 * @param repoPath  - Optional repo/working directory to search for repo-local skills
 * @returns The skill content (SKILL.md body), or undefined if not found
 */
export async function resolveSkillContent(
  skillName: string,
  repoPath?: string
): Promise<string | undefined> {
  // ── 1. Filesystem: project + global skill directories ─────────────────
  try {
    const registry = new SkillRegistry({ projectDir: process.cwd() });
    const fsSkill = registry.getSkill(skillName);
    if (fsSkill?.content) {
      return fsSkill.content;
    }
  } catch {
    // Filesystem discovery failed, continue
  }

  // ── 2. Repository-local skills ─────────────────────────────────────────
  if (repoPath) {
    try {
      const repoSkills = discoverSkillsFromPath(repoPath);
      const repoSkill = repoSkills.find((s) => s.name === skillName);
      if (repoSkill?.content) {
        return repoSkill.content;
      }
    } catch {
      // Repo discovery failed, continue
    }
  }

  // ── 3. Postgres database (serverless / Vercel) ──────────────────────────
  try {
    const { getDatabaseDriver } = require("../db/index") as typeof import("../db/index");
    const driver = getDatabaseDriver();

    if (driver === "postgres") {
      const { getPostgresDatabase } = require("../db/index") as typeof import("../db/index");
      const { PgSkillStore } = require("../db/pg-skill-store") as typeof import("../db/pg-skill-store");
      const db = getPostgresDatabase();
      const store = new PgSkillStore(db);
      const stored = await store.get(skillName);
      if (stored) {
        const def = store.toSkillDefinition(stored);
        if (def.content) {
          return def.content;
        }
      }
    }
  } catch {
    // Postgres load failed, continue
  }

  // ── 4. SQLite database (desktop) ─────────────────────────────────────────
  // Dynamically required to prevent webpack from bundling better-sqlite3
  // in web builds. Relative paths work here since we're in src/core/skills/.
  try {
    const { getDatabaseDriver } = require("../db/index") as typeof import("../db/index");
    const driver = getDatabaseDriver();

    if (driver === "sqlite") {
      // eslint-disable-next-line no-eval
      const dynamicRequire = eval("require") as NodeRequire;
      const { getSqliteDatabase } = dynamicRequire("../db/sqlite");
      const { SqliteSkillStore } = dynamicRequire("../db/sqlite-stores");
      const db = getSqliteDatabase() as object;
      const store = new SqliteSkillStore(db) as {
        get(id: string): Promise<{ files: Array<{ path: string; content: string }> } | undefined>;
        toSkillDefinition(s: object): SkillDefinition;
      };
      const stored = await store.get(skillName);
      if (stored) {
        const def = store.toSkillDefinition(stored);
        if (def.content) {
          return def.content;
        }
      }
    }
  } catch {
    // SQLite load failed or not available
  }

  return undefined;
}
