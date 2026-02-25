/**
 * PgCodebaseStore — Postgres-backed codebase store using Drizzle ORM.
 */

import { eq, and } from "drizzle-orm";
import type { Database } from "./index";
import { codebases } from "./schema";
import type { Codebase } from "../models/codebase";

export interface CodebaseStore {
  add(codebase: Codebase): Promise<void>;
  get(codebaseId: string): Promise<Codebase | undefined>;
  listByWorkspace(workspaceId: string): Promise<Codebase[]>;
  update(codebaseId: string, fields: { branch?: string; label?: string }): Promise<void>;
  remove(codebaseId: string): Promise<void>;
  getDefault(workspaceId: string): Promise<Codebase | undefined>;
  setDefault(workspaceId: string, codebaseId: string): Promise<void>;
  countByWorkspace(workspaceId: string): Promise<number>;
  findByRepoPath(workspaceId: string, repoPath: string): Promise<Codebase | undefined>;
}

export class PgCodebaseStore implements CodebaseStore {
  constructor(private db: Database) {}

  async add(codebase: Codebase): Promise<void> {
    await this.db.insert(codebases).values({
      id: codebase.id,
      workspaceId: codebase.workspaceId,
      repoPath: codebase.repoPath,
      branch: codebase.branch,
      label: codebase.label,
      isDefault: codebase.isDefault,
      createdAt: codebase.createdAt,
      updatedAt: codebase.updatedAt,
    });
  }

  async get(codebaseId: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(codebases)
      .where(eq(codebases.id, codebaseId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Codebase[]> {
    const rows = await this.db
      .select()
      .from(codebases)
      .where(eq(codebases.workspaceId, workspaceId));
    return rows.map(this.toModel);
  }

  async update(codebaseId: string, fields: { branch?: string; label?: string }): Promise<void> {
    await this.db
      .update(codebases)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(codebases.id, codebaseId));
  }

  async remove(codebaseId: string): Promise<void> {
    await this.db.delete(codebases).where(eq(codebases.id, codebaseId));
  }

  async getDefault(workspaceId: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(codebases)
      .where(and(eq(codebases.workspaceId, workspaceId), eq(codebases.isDefault, true)))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async setDefault(workspaceId: string, codebaseId: string): Promise<void> {
    await this.db
      .update(codebases)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(codebases.workspaceId, workspaceId), eq(codebases.isDefault, true)));
    await this.db
      .update(codebases)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(codebases.id, codebaseId));
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(codebases)
      .where(eq(codebases.workspaceId, workspaceId));
    return rows.length;
  }

  async findByRepoPath(workspaceId: string, repoPath: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(codebases)
      .where(and(eq(codebases.workspaceId, workspaceId), eq(codebases.repoPath, repoPath)))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  private toModel(row: typeof codebases.$inferSelect): Codebase {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      repoPath: row.repoPath,
      branch: row.branch ?? undefined,
      label: row.label ?? undefined,
      isDefault: row.isDefault,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
