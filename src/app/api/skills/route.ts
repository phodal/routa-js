/**
 * Skills REST API Route - /api/skills
 *
 * Provides a simple REST interface for skill discovery and loading.
 * Used by the browser client alongside the ACP JSON-RPC endpoint.
 *
 * GET  /api/skills         - List all skills
 * GET  /api/skills?name=x  - Load a specific skill
 * POST /api/skills/reload  - Reload skills from disk
 *
 * On serverless environments (Vercel), skills are loaded from the database
 * in addition to the filesystem (which may be empty or read-only).
 */

import { NextRequest, NextResponse } from "next/server";
import { SkillRegistry } from "@/core/skills/skill-registry";
import { discoverSkillsFromPath, type SkillDefinition } from "@/core/skills";
import { getDatabase, getDatabaseDriver } from "@/core/db";
import { PgSkillStore } from "@/core/db/pg-skill-store";

let registry: SkillRegistry | undefined;

function getRegistry(): SkillRegistry {
  if (!registry) {
    registry = new SkillRegistry({ projectDir: process.cwd() });
  }
  return registry;
}

function isServerlessEnvironment(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

/**
 * Get database-stored skills (for serverless environments).
 */
async function getDbSkills(): Promise<SkillDefinition[]> {
  const dbDriver = getDatabaseDriver();
  if (dbDriver !== "postgres") {
    return [];
  }

  try {
    const db = getDatabase();
    const skillStore = new PgSkillStore(db);
    const storedSkills = await skillStore.list();
    return storedSkills.map((s) => skillStore.toSkillDefinition(s));
  } catch (err) {
    console.warn("[Skills API] Failed to load skills from database:", err);
    return [];
  }
}

export async function GET(request: NextRequest) {
  const reg = getRegistry();
  const name = request.nextUrl.searchParams.get("name");
  const repoPath = request.nextUrl.searchParams.get("repoPath");

  // Load database skills on serverless environments
  const dbSkills = isServerlessEnvironment() ? await getDbSkills() : [];

  if (name) {
    // First try the local registry (project + global skills)
    let skill = reg.getSkill(name);

    // If not found in registry, check database skills (serverless)
    if (!skill && dbSkills.length > 0) {
      skill = dbSkills.find((s) => s.name === name);
    }

    // If not found and a repoPath is provided, search in the repo's skill directories
    if (!skill && repoPath) {
      try {
        const repoSkills = discoverSkillsFromPath(repoPath);
        skill = repoSkills.find((s) => s.name === name);
      } catch (err) {
        console.warn(`[Skills API] Failed to discover skills from repo path: ${repoPath}`, err);
      }
    }

    if (!skill) {
      return NextResponse.json(
        { error: `Skill not found: ${name}${repoPath ? ` (also searched in ${repoPath})` : ""}` },
        { status: 404 }
      );
    }
    return NextResponse.json({
      name: skill.name,
      description: skill.description,
      content: skill.content,
      license: skill.license,
      compatibility: skill.compatibility,
      metadata: skill.metadata,
    });
  }

  // Combine filesystem skills with database skills
  const fsSkills = reg.listSkills();
  const allSkillsMap = new Map<string, SkillDefinition>();

  // Add filesystem skills first
  for (const s of fsSkills) {
    allSkillsMap.set(s.name, s);
  }

  // Add/override with database skills (they are the installed ones on serverless)
  for (const s of dbSkills) {
    allSkillsMap.set(s.name, s);
  }

  const allSkills = Array.from(allSkillsMap.values());

  return NextResponse.json({
    skills: allSkills.map((s) => ({
      name: s.name,
      description: s.description,
      shortDescription: s.shortDescription,
      license: s.license,
      compatibility: s.compatibility,
    })),
  });
}

export async function POST() {
  const reg = getRegistry();
  reg.reload(process.cwd());

  // On serverless, also count database skills
  const dbSkillCount = isServerlessEnvironment() ? (await getDbSkills()).length : 0;

  return NextResponse.json({
    reloaded: true,
    count: reg.listSkills().length + dbSkillCount,
  });
}
