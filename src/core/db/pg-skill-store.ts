/**
 * PgSkillStore — Postgres-backed skill store using Drizzle ORM.
 *
 * Used for storing skills in serverless environments (Vercel)
 * where filesystem storage is ephemeral.
 */

import { eq } from "drizzle-orm";
import type { Database } from "./index";
import { skills, SkillFileEntry } from "./schema";
import type { SkillDefinition } from "../skills/skill-loader";

export interface StoredSkill {
  id: string;
  name: string;
  description: string;
  source: string;
  catalogType: string;
  files: SkillFileEntry[];
  license?: string;
  metadata: Record<string, string>;
  installs: number;
  createdAt: Date;
  updatedAt: Date;
}

export class PgSkillStore {
  constructor(private db: Database) {}

  /**
   * Save or update a skill.
   */
  async save(skill: {
    id: string;
    name: string;
    description: string;
    source: string;
    catalogType: string;
    files: SkillFileEntry[];
    license?: string;
    metadata?: Record<string, string>;
  }): Promise<void> {
    await this.db
      .insert(skills)
      .values({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        catalogType: skill.catalogType,
        files: skill.files,
        license: skill.license ?? null,
        metadata: skill.metadata ?? {},
        installs: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: skills.id,
        set: {
          name: skill.name,
          description: skill.description,
          source: skill.source,
          catalogType: skill.catalogType,
          files: skill.files,
          license: skill.license ?? null,
          metadata: skill.metadata ?? {},
          updatedAt: new Date(),
        },
      });
  }

  /**
   * Get a skill by ID (name).
   */
  async get(skillId: string): Promise<StoredSkill | undefined> {
    const rows = await this.db
      .select()
      .from(skills)
      .where(eq(skills.id, skillId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  /**
   * List all installed skills.
   */
  async list(): Promise<StoredSkill[]> {
    const rows = await this.db.select().from(skills);
    return rows.map(this.toModel);
  }

  /**
   * Delete a skill by ID.
   */
  async delete(skillId: string): Promise<void> {
    await this.db.delete(skills).where(eq(skills.id, skillId));
  }

  /**
   * Convert a stored skill to a SkillDefinition for API compatibility.
   * Extracts content from the SKILL.md file in the files array.
   */
  toSkillDefinition(skill: StoredSkill): SkillDefinition {
    // Find the main SKILL.md file
    const skillFile = skill.files.find(
      (f) => f.path === "SKILL.md" || f.path.endsWith("/SKILL.md")
    );
    const content = skillFile?.content ?? "";

    return {
      name: skill.name,
      description: skill.description,
      content,
      source: `db:${skill.source}`,
      license: skill.license,
      metadata: skill.metadata,
    };
  }

  private toModel(row: typeof skills.$inferSelect): StoredSkill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      source: row.source,
      catalogType: row.catalogType,
      files: (row.files as SkillFileEntry[]) ?? [],
      license: row.license ?? undefined,
      metadata: (row.metadata as Record<string, string>) ?? {},
      installs: row.installs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

