/**
 * SQLite Store Implementations — for desktop platforms (Tauri / Electron).
 *
 * Mirrors the Pg store implementations but uses the SQLite schema.
 * All stores implement the same interfaces as their Pg counterparts.
 */

import { eq, and, gte, lte, desc, sql } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import * as sqliteSchema from "./sqlite-schema";
import type { Workspace, WorkspaceStatus } from "../models/workspace";
import type { Agent, AgentRole, AgentStatus } from "../models/agent";
import type { Task, TaskStatus } from "../models/task";
import type { Message, MessageRole } from "../models/message";
import type { Note, NoteType, NoteMetadata } from "../models/note";
import { createSpecNote, SPEC_NOTE_ID } from "../models/note";
import type { WorkspaceStore } from "./pg-workspace-store";
import type { AgentStore } from "../store/agent-store";
import type { TaskStore } from "../store/task-store";
import type { ConversationStore } from "../store/conversation-store";
import type { NoteStore } from "../store/note-store";
import type { AcpSessionStore, AcpSession, AcpSessionNotification } from "../store/acp-session-store";

type SqliteDb = BetterSQLite3Database<typeof sqliteSchema>;

// ─── SQLite Workspace Store ─────────────────────────────────────────────

export class SqliteWorkspaceStore implements WorkspaceStore {
  constructor(private db: SqliteDb) {}

  async save(workspace: Workspace): Promise<void> {
    await this.db
      .insert(sqliteSchema.workspaces)
      .values({
        id: workspace.id,
        title: workspace.title,
        status: workspace.status,
        metadata: workspace.metadata,
        createdAt: workspace.createdAt,
        updatedAt: workspace.updatedAt,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.workspaces.id,
        set: {
          title: workspace.title,
          status: workspace.status,
          metadata: workspace.metadata,
          updatedAt: new Date(),
        },
      });
  }

  async get(workspaceId: string): Promise<Workspace | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.workspaces)
      .where(eq(sqliteSchema.workspaces.id, workspaceId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async list(): Promise<Workspace[]> {
    const rows = await this.db.select().from(sqliteSchema.workspaces);
    return rows.map(this.toModel);
  }

  async listByStatus(status: WorkspaceStatus): Promise<Workspace[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.workspaces)
      .where(eq(sqliteSchema.workspaces.status, status));
    return rows.map(this.toModel);
  }

  async updateTitle(workspaceId: string, title: string): Promise<void> {
    await this.db
      .update(sqliteSchema.workspaces)
      .set({ title, updatedAt: new Date() })
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  async updateStatus(workspaceId: string, status: WorkspaceStatus): Promise<void> {
    await this.db
      .update(sqliteSchema.workspaces)
      .set({ status, updatedAt: new Date() })
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  async delete(workspaceId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.workspaces)
      .where(eq(sqliteSchema.workspaces.id, workspaceId));
  }

  private toModel(row: typeof sqliteSchema.workspaces.$inferSelect): Workspace {
    return {
      id: row.id,
      title: row.title,
      status: row.status as WorkspaceStatus,
      metadata: (row.metadata as Record<string, string>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite Codebase Store ──────────────────────────────────────────────

import type { Codebase } from "../models/codebase";
import type { CodebaseStore } from "./pg-codebase-store";

export class SqliteCodebaseStore implements CodebaseStore {
  constructor(private db: SqliteDb) {}

  async add(codebase: Codebase): Promise<void> {
    await this.db.insert(sqliteSchema.codebases).values({
      id: codebase.id,
      workspaceId: codebase.workspaceId,
      repoPath: codebase.repoPath,
      branch: codebase.branch,
      label: codebase.label,
      isDefault: codebase.isDefault,
      sourceType: codebase.sourceType ?? null,
      sourceUrl: codebase.sourceUrl ?? null,
      createdAt: codebase.createdAt,
      updatedAt: codebase.updatedAt,
    });
  }

  async get(codebaseId: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.codebases)
      .where(eq(sqliteSchema.codebases.id, codebaseId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Codebase[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.codebases)
      .where(eq(sqliteSchema.codebases.workspaceId, workspaceId));
    return rows.map(this.toModel);
  }

  async update(codebaseId: string, fields: { branch?: string; label?: string }): Promise<void> {
    await this.db
      .update(sqliteSchema.codebases)
      .set({ ...fields, updatedAt: new Date() })
      .where(eq(sqliteSchema.codebases.id, codebaseId));
  }

  async remove(codebaseId: string): Promise<void> {
    await this.db.delete(sqliteSchema.codebases).where(eq(sqliteSchema.codebases.id, codebaseId));
  }

  async getDefault(workspaceId: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.codebases)
      .where(and(eq(sqliteSchema.codebases.workspaceId, workspaceId), eq(sqliteSchema.codebases.isDefault, true)))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async setDefault(workspaceId: string, codebaseId: string): Promise<void> {
    await this.db
      .update(sqliteSchema.codebases)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(and(eq(sqliteSchema.codebases.workspaceId, workspaceId), eq(sqliteSchema.codebases.isDefault, true)));
    await this.db
      .update(sqliteSchema.codebases)
      .set({ isDefault: true, updatedAt: new Date() })
      .where(eq(sqliteSchema.codebases.id, codebaseId));
  }

  async countByWorkspace(workspaceId: string): Promise<number> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.codebases)
      .where(eq(sqliteSchema.codebases.workspaceId, workspaceId));
    return rows.length;
  }

  async findByRepoPath(workspaceId: string, repoPath: string): Promise<Codebase | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.codebases)
      .where(and(eq(sqliteSchema.codebases.workspaceId, workspaceId), eq(sqliteSchema.codebases.repoPath, repoPath)))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  private toModel(row: typeof sqliteSchema.codebases.$inferSelect): Codebase {
    return {
      id: row.id,
      workspaceId: row.workspaceId,
      repoPath: row.repoPath,
      branch: row.branch ?? undefined,
      label: row.label ?? undefined,
      isDefault: row.isDefault,
      sourceType: (row.sourceType as Codebase["sourceType"]) ?? undefined,
      sourceUrl: row.sourceUrl ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite Agent Store ─────────────────────────────────────────────────

export class SqliteAgentStore implements AgentStore {
  constructor(private db: SqliteDb) {}

  async save(agent: Agent): Promise<void> {
    await this.db
      .insert(sqliteSchema.agents)
      .values({
        id: agent.id,
        name: agent.name,
        role: agent.role,
        modelTier: agent.modelTier,
        workspaceId: agent.workspaceId,
        parentId: agent.parentId,
        status: agent.status,
        metadata: agent.metadata,
        createdAt: agent.createdAt,
        updatedAt: agent.updatedAt,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.agents.id,
        set: {
          name: agent.name,
          role: agent.role,
          modelTier: agent.modelTier,
          status: agent.status,
          parentId: agent.parentId,
          metadata: agent.metadata,
          updatedAt: new Date(),
        },
      });
  }

  async get(agentId: string): Promise<Agent | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.agents)
      .where(eq(sqliteSchema.agents.id, agentId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.agents)
      .where(eq(sqliteSchema.agents.workspaceId, workspaceId));
    return rows.map(this.toModel);
  }

  async listByParent(parentId: string): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.agents)
      .where(eq(sqliteSchema.agents.parentId, parentId));
    return rows.map(this.toModel);
  }

  async listByRole(workspaceId: string, role: AgentRole): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.agents)
      .where(
        and(
          eq(sqliteSchema.agents.workspaceId, workspaceId),
          eq(sqliteSchema.agents.role, role)
        )
      );
    return rows.map(this.toModel);
  }

  async listByStatus(workspaceId: string, status: AgentStatus): Promise<Agent[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.agents)
      .where(
        and(
          eq(sqliteSchema.agents.workspaceId, workspaceId),
          eq(sqliteSchema.agents.status, status)
        )
      );
    return rows.map(this.toModel);
  }

  async delete(agentId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.agents)
      .where(eq(sqliteSchema.agents.id, agentId));
  }

  async updateStatus(agentId: string, status: AgentStatus): Promise<void> {
    await this.db
      .update(sqliteSchema.agents)
      .set({ status, updatedAt: new Date() })
      .where(eq(sqliteSchema.agents.id, agentId));
  }

  private toModel(row: typeof sqliteSchema.agents.$inferSelect): Agent {
    return {
      id: row.id,
      name: row.name,
      role: row.role as AgentRole,
      modelTier: row.modelTier as import("../models/agent").ModelTier,
      workspaceId: row.workspaceId,
      parentId: row.parentId ?? undefined,
      status: row.status as AgentStatus,
      metadata: (row.metadata as Record<string, string>) ?? {},
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite Task Store ──────────────────────────────────────────────────

export class SqliteTaskStore implements TaskStore {
  constructor(private db: SqliteDb) {}

  async save(task: Task): Promise<void> {
    const version = (task as Task & { version?: number }).version ?? 1;
    await this.db
      .insert(sqliteSchema.tasks)
      .values({
        id: task.id,
        title: task.title,
        objective: task.objective,
        scope: task.scope,
        acceptanceCriteria: task.acceptanceCriteria,
        verificationCommands: task.verificationCommands,
        assignedTo: task.assignedTo,
        status: task.status,
        dependencies: task.dependencies,
        parallelGroup: task.parallelGroup,
        workspaceId: task.workspaceId,
        completionSummary: task.completionSummary,
        verificationVerdict: task.verificationVerdict,
        verificationReport: task.verificationReport,
        version,
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.tasks.id,
        set: {
          title: task.title,
          objective: task.objective,
          scope: task.scope,
          acceptanceCriteria: task.acceptanceCriteria,
          verificationCommands: task.verificationCommands,
          assignedTo: task.assignedTo,
          status: task.status,
          dependencies: task.dependencies,
          parallelGroup: task.parallelGroup,
          completionSummary: task.completionSummary,
          verificationVerdict: task.verificationVerdict,
          verificationReport: task.verificationReport,
          version: sql`${sqliteSchema.tasks.version} + 1`,
          updatedAt: new Date(),
        },
      });
  }

  async get(taskId: string): Promise<Task | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.tasks)
      .where(eq(sqliteSchema.tasks.id, taskId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.tasks)
      .where(eq(sqliteSchema.tasks.workspaceId, workspaceId));
    return rows.map(this.toModel);
  }

  async listByStatus(workspaceId: string, status: TaskStatus): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.tasks)
      .where(
        and(
          eq(sqliteSchema.tasks.workspaceId, workspaceId),
          eq(sqliteSchema.tasks.status, status)
        )
      );
    return rows.map(this.toModel);
  }

  async listByAssignee(agentId: string): Promise<Task[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.tasks)
      .where(eq(sqliteSchema.tasks.assignedTo, agentId));
    return rows.map(this.toModel);
  }

  async findReadyTasks(workspaceId: string): Promise<Task[]> {
    const allTasks = await this.listByWorkspace(workspaceId);
    const taskMap = new Map(allTasks.map((t) => [t.id, t]));

    return allTasks.filter((task) => {
      if (task.status !== "PENDING") return false;
      return task.dependencies.every((depId) => {
        const dep = taskMap.get(depId);
        return dep && dep.status === "COMPLETED";
      });
    });
  }

  async updateStatus(taskId: string, status: TaskStatus): Promise<void> {
    await this.db
      .update(sqliteSchema.tasks)
      .set({
        status,
        updatedAt: new Date(),
        version: sql`${sqliteSchema.tasks.version} + 1`,
      })
      .where(eq(sqliteSchema.tasks.id, taskId));
  }

  async delete(taskId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.tasks)
      .where(eq(sqliteSchema.tasks.id, taskId));
  }

  async atomicUpdate(
    taskId: string,
    expectedVersion: number,
    updates: Partial<
      Pick<
        Task,
        | "status"
        | "completionSummary"
        | "verificationVerdict"
        | "verificationReport"
        | "assignedTo"
      >
    >
  ): Promise<boolean> {
    const result = this.db
      .update(sqliteSchema.tasks)
      .set({
        ...updates,
        version: sql`${sqliteSchema.tasks.version} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sqliteSchema.tasks.id, taskId),
          eq(sqliteSchema.tasks.version, expectedVersion)
        )
      )
      .run();

    return (result?.changes ?? 0) > 0;
  }

  private toModel(row: typeof sqliteSchema.tasks.$inferSelect): Task {
    return {
      id: row.id,
      title: row.title,
      objective: row.objective,
      scope: row.scope ?? undefined,
      acceptanceCriteria: (row.acceptanceCriteria as string[]) ?? undefined,
      verificationCommands: (row.verificationCommands as string[]) ?? undefined,
      assignedTo: row.assignedTo ?? undefined,
      status: row.status as TaskStatus,
      dependencies: (row.dependencies as string[]) ?? [],
      parallelGroup: row.parallelGroup ?? undefined,
      workspaceId: row.workspaceId,
      completionSummary: row.completionSummary ?? undefined,
      verificationVerdict: row.verificationVerdict as
        | import("../models/task").VerificationVerdict
        | undefined,
      verificationReport: row.verificationReport ?? undefined,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite Conversation Store ──────────────────────────────────────────

export class SqliteConversationStore implements ConversationStore {
  constructor(private db: SqliteDb) {}

  async append(message: Message): Promise<void> {
    await this.db.insert(sqliteSchema.messages).values({
      id: message.id,
      agentId: message.agentId,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
      toolName: message.toolName,
      toolArgs: message.toolArgs,
      turn: message.turn,
    });
  }

  async getConversation(agentId: string): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.messages)
      .where(eq(sqliteSchema.messages.agentId, agentId))
      .orderBy(sqliteSchema.messages.timestamp);
    return rows.map(this.toModel);
  }

  async getLastN(agentId: string, n: number): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.messages)
      .where(eq(sqliteSchema.messages.agentId, agentId))
      .orderBy(desc(sqliteSchema.messages.timestamp))
      .limit(n);
    return rows.reverse().map(this.toModel);
  }

  async getByTurnRange(
    agentId: string,
    startTurn: number,
    endTurn: number
  ): Promise<Message[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.messages)
      .where(
        and(
          eq(sqliteSchema.messages.agentId, agentId),
          gte(sqliteSchema.messages.turn, startTurn),
          lte(sqliteSchema.messages.turn, endTurn)
        )
      )
      .orderBy(sqliteSchema.messages.timestamp);
    return rows.map(this.toModel);
  }

  async getMessageCount(agentId: string): Promise<number> {
    const result = await this.db
      .select({ count: sql<number>`count(*)` })
      .from(sqliteSchema.messages)
      .where(eq(sqliteSchema.messages.agentId, agentId));
    return result[0]?.count ?? 0;
  }

  async deleteConversation(agentId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.messages)
      .where(eq(sqliteSchema.messages.agentId, agentId));
  }

  private toModel(row: typeof sqliteSchema.messages.$inferSelect): Message {
    return {
      id: row.id,
      agentId: row.agentId,
      role: row.role as MessageRole,
      content: row.content,
      timestamp: row.timestamp,
      toolName: row.toolName ?? undefined,
      toolArgs: row.toolArgs ?? undefined,
      turn: row.turn ?? undefined,
    };
  }
}

// ─── SQLite Note Store ──────────────────────────────────────────────────

export class SqliteNoteStore implements NoteStore {
  constructor(private db: SqliteDb) {}

  async save(note: Note, _source?: "agent" | "user" | "system"): Promise<void> {
    await this.db
      .insert(sqliteSchema.notes)
      .values({
        id: note.id,
        workspaceId: note.workspaceId,
        title: note.title,
        content: note.content,
        type: note.metadata.type,
        taskStatus: note.metadata.taskStatus,
        assignedAgentIds: note.metadata.assignedAgentIds,
        parentNoteId: note.metadata.parentNoteId,
        linkedTaskId: note.metadata.linkedTaskId,
        customMetadata: note.metadata.custom,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      })
      .onConflictDoUpdate({
        target: [sqliteSchema.notes.workspaceId, sqliteSchema.notes.id],
        set: {
          title: note.title,
          content: note.content,
          type: note.metadata.type,
          taskStatus: note.metadata.taskStatus,
          assignedAgentIds: note.metadata.assignedAgentIds,
          parentNoteId: note.metadata.parentNoteId,
          linkedTaskId: note.metadata.linkedTaskId,
          customMetadata: note.metadata.custom,
          updatedAt: new Date(),
        },
      });
  }

  async get(noteId: string, workspaceId: string): Promise<Note | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.notes)
      .where(
        and(
          eq(sqliteSchema.notes.workspaceId, workspaceId),
          eq(sqliteSchema.notes.id, noteId)
        )
      )
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async listByWorkspace(workspaceId: string): Promise<Note[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.notes)
      .where(eq(sqliteSchema.notes.workspaceId, workspaceId));
    return rows.map(this.toModel);
  }

  async listByType(workspaceId: string, type: NoteType): Promise<Note[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.notes)
      .where(
        and(
          eq(sqliteSchema.notes.workspaceId, workspaceId),
          eq(sqliteSchema.notes.type, type)
        )
      );
    return rows.map(this.toModel);
  }

  async listByAssignedAgent(
    workspaceId: string,
    agentId: string
  ): Promise<Note[]> {
    const allNotes = await this.listByWorkspace(workspaceId);
    return allNotes.filter((n) =>
      n.metadata.assignedAgentIds?.includes(agentId)
    );
  }

  async delete(noteId: string, workspaceId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.notes)
      .where(
        and(
          eq(sqliteSchema.notes.workspaceId, workspaceId),
          eq(sqliteSchema.notes.id, noteId)
        )
      );
  }

  async ensureSpec(workspaceId: string): Promise<Note> {
    const existing = await this.get(SPEC_NOTE_ID, workspaceId);
    if (existing) return existing;

    const spec = createSpecNote(workspaceId);
    await this.save(spec);
    return spec;
  }

  private toModel(row: typeof sqliteSchema.notes.$inferSelect): Note {
    const metadata: NoteMetadata = {
      type: row.type as NoteType,
      taskStatus: row.taskStatus as
        | import("../models/task").TaskStatus
        | undefined,
      assignedAgentIds: (row.assignedAgentIds as string[]) ?? undefined,
      parentNoteId: row.parentNoteId ?? undefined,
      linkedTaskId: row.linkedTaskId ?? undefined,
      custom: (row.customMetadata as Record<string, string>) ?? undefined,
    };

    return {
      id: row.id,
      title: row.title,
      content: row.content,
      workspaceId: row.workspaceId,
      metadata,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite ACP Session Store ───────────────────────────────────────────

export class SqliteAcpSessionStore implements AcpSessionStore {
  constructor(private db: SqliteDb) {}

  async save(session: AcpSession): Promise<void> {
    await this.db
      .insert(sqliteSchema.acpSessions)
      .values({
        id: session.id,
        name: session.name,
        cwd: session.cwd,
        workspaceId: session.workspaceId,
        routaAgentId: session.routaAgentId,
        provider: session.provider,
        role: session.role,
        modeId: session.modeId,
        firstPromptSent: session.firstPromptSent ?? false,
        messageHistory: session.messageHistory,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
      })
      .onConflictDoUpdate({
        target: sqliteSchema.acpSessions.id,
        set: {
          name: session.name,
          modeId: session.modeId,
          firstPromptSent: session.firstPromptSent ?? false,
          messageHistory: session.messageHistory,
          updatedAt: new Date(),
        },
      });
  }

  async get(sessionId: string): Promise<AcpSession | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.acpSessions)
      .where(eq(sqliteSchema.acpSessions.id, sessionId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  async list(): Promise<AcpSession[]> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.acpSessions)
      .orderBy(desc(sqliteSchema.acpSessions.createdAt));
    return rows.map(this.toModel);
  }

  async delete(sessionId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.acpSessions)
      .where(eq(sqliteSchema.acpSessions.id, sessionId));
  }

  async rename(sessionId: string, name: string): Promise<void> {
    await this.db
      .update(sqliteSchema.acpSessions)
      .set({ name, updatedAt: new Date() })
      .where(eq(sqliteSchema.acpSessions.id, sessionId));
  }

  async appendHistory(sessionId: string, notification: AcpSessionNotification): Promise<void> {
    const session = await this.get(sessionId);
    if (!session) return;
    const history = [...session.messageHistory, notification];
    await this.db
      .update(sqliteSchema.acpSessions)
      .set({ messageHistory: history, updatedAt: new Date() })
      .where(eq(sqliteSchema.acpSessions.id, sessionId));
  }

  async getHistory(sessionId: string): Promise<AcpSessionNotification[]> {
    const session = await this.get(sessionId);
    return session?.messageHistory ?? [];
  }

  async markFirstPromptSent(sessionId: string): Promise<void> {
    await this.db
      .update(sqliteSchema.acpSessions)
      .set({ firstPromptSent: true, updatedAt: new Date() })
      .where(eq(sqliteSchema.acpSessions.id, sessionId));
  }

  async updateMode(sessionId: string, modeId: string): Promise<void> {
    await this.db
      .update(sqliteSchema.acpSessions)
      .set({ modeId, updatedAt: new Date() })
      .where(eq(sqliteSchema.acpSessions.id, sessionId));
  }

  private toModel(row: typeof sqliteSchema.acpSessions.$inferSelect): AcpSession {
    return {
      id: row.id,
      name: row.name ?? undefined,
      cwd: row.cwd,
      workspaceId: row.workspaceId,
      routaAgentId: row.routaAgentId ?? undefined,
      provider: row.provider ?? undefined,
      role: row.role ?? undefined,
      modeId: row.modeId ?? undefined,
      firstPromptSent: row.firstPromptSent ?? false,
      messageHistory: row.messageHistory ?? [],
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

// ─── SQLite Skill Store ──────────────────────────────────────────────────

import type { SkillFileEntry } from "./schema";
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

export class SqliteSkillStore {
  constructor(private db: SqliteDb) {}

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
    const existing = await this.get(skill.id);
    if (existing) {
      await this.db
        .update(sqliteSchema.skills)
        .set({
          name: skill.name,
          description: skill.description,
          source: skill.source,
          catalogType: skill.catalogType,
          files: JSON.stringify(skill.files),
          license: skill.license ?? null,
          metadata: JSON.stringify(skill.metadata ?? {}),
          updatedAt: new Date(),
        })
        .where(eq(sqliteSchema.skills.id, skill.id));
    } else {
      await this.db.insert(sqliteSchema.skills).values({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        catalogType: skill.catalogType,
        files: JSON.stringify(skill.files),
        license: skill.license ?? null,
        metadata: JSON.stringify(skill.metadata ?? {}),
        installs: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }
  }

  /**
   * Get a skill by ID (name).
   */
  async get(skillId: string): Promise<StoredSkill | undefined> {
    const rows = await this.db
      .select()
      .from(sqliteSchema.skills)
      .where(eq(sqliteSchema.skills.id, skillId))
      .limit(1);
    return rows[0] ? this.toModel(rows[0]) : undefined;
  }

  /**
   * List all installed skills.
   */
  async list(): Promise<StoredSkill[]> {
    const rows = await this.db.select().from(sqliteSchema.skills);
    return rows.map(this.toModel);
  }

  /**
   * Delete a skill by ID.
   */
  async delete(skillId: string): Promise<void> {
    await this.db
      .delete(sqliteSchema.skills)
      .where(eq(sqliteSchema.skills.id, skillId));
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

  private toModel(row: typeof sqliteSchema.skills.$inferSelect): StoredSkill {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      source: row.source,
      catalogType: row.catalogType,
      files: (JSON.parse(row.files ?? "[]") as SkillFileEntry[]) ?? [],
      license: row.license ?? undefined,
      metadata: (JSON.parse(row.metadata ?? "{}") as Record<string, string>) ?? {},
      installs: row.installs,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

