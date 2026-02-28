/**
 * GitHub Webhook Config & Trigger Log Store
 *
 * Provides CRUD operations for:
 * - githubWebhookConfigs: user-configured trigger rules
 * - webhookTriggerLogs: audit log for received events
 *
 * Works with both Postgres and SQLite backends.
 */

import { eq, desc } from "drizzle-orm";
import { v4 as uuidv4 } from "uuid";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface GitHubWebhookConfig {
  id: string;
  name: string;
  /** "owner/repo" */
  repo: string;
  githubToken: string;
  webhookSecret: string;
  /** e.g. ["issues", "pull_request", "check_run"] */
  eventTypes: string[];
  /** Optional: only trigger for issues with these labels */
  labelFilter: string[];
  /** ACP agent/provider ID to trigger */
  triggerAgentId: string;
  workspaceId?: string | null;
  enabled: boolean;
  /** Prompt template with {event}, {action}, {payload} placeholders */
  promptTemplate?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface WebhookTriggerLog {
  id: string;
  configId: string;
  eventType: string;
  eventAction?: string | null;
  payload: Record<string, unknown>;
  backgroundTaskId?: string | null;
  signatureValid: boolean;
  outcome: "triggered" | "skipped" | "error";
  errorMessage?: string | null;
  createdAt: Date;
}

export interface CreateWebhookConfigInput {
  name: string;
  repo: string;
  githubToken: string;
  webhookSecret?: string;
  eventTypes: string[];
  labelFilter?: string[];
  triggerAgentId: string;
  workspaceId?: string;
  enabled?: boolean;
  promptTemplate?: string;
}

export interface UpdateWebhookConfigInput extends Partial<CreateWebhookConfigInput> {
  id: string;
}

// ─── In-Memory Store (fallback for no-DB mode) ───────────────────────────────

export class InMemoryGitHubWebhookStore {
  private configs = new Map<string, GitHubWebhookConfig>();
  private logs: WebhookTriggerLog[] = [];

  async listConfigs(workspaceId?: string): Promise<GitHubWebhookConfig[]> {
    const all = Array.from(this.configs.values());
    if (workspaceId) return all.filter((c) => c.workspaceId === workspaceId);
    return all;
  }

  async getConfig(id: string): Promise<GitHubWebhookConfig | undefined> {
    return this.configs.get(id);
  }

  async createConfig(input: CreateWebhookConfigInput): Promise<GitHubWebhookConfig> {
    const config: GitHubWebhookConfig = {
      id: uuidv4(),
      name: input.name,
      repo: input.repo,
      githubToken: input.githubToken,
      webhookSecret: input.webhookSecret ?? "",
      eventTypes: input.eventTypes,
      labelFilter: input.labelFilter ?? [],
      triggerAgentId: input.triggerAgentId,
      workspaceId: input.workspaceId,
      enabled: input.enabled ?? true,
      promptTemplate: input.promptTemplate,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.configs.set(config.id, config);
    return config;
  }

  async updateConfig(input: UpdateWebhookConfigInput): Promise<GitHubWebhookConfig | undefined> {
    const existing = this.configs.get(input.id);
    if (!existing) return undefined;
    const updated: GitHubWebhookConfig = {
      ...existing,
      ...input,
      updatedAt: new Date(),
    };
    this.configs.set(updated.id, updated);
    return updated;
  }

  async deleteConfig(id: string): Promise<void> {
    this.configs.delete(id);
  }

  async appendLog(log: Omit<WebhookTriggerLog, "id" | "createdAt">): Promise<WebhookTriggerLog> {
    const entry: WebhookTriggerLog = {
      ...log,
      id: uuidv4(),
      createdAt: new Date(),
    };
    this.logs.push(entry);
    return entry;
  }

  async listLogs(configId?: string, limit = 50): Promise<WebhookTriggerLog[]> {
    let filtered = configId ? this.logs.filter((l) => l.configId === configId) : this.logs;
    return filtered.slice(-limit).reverse();
  }
}

// ─── Postgres Store ───────────────────────────────────────────────────────────

export class PgGitHubWebhookStore {
  constructor(private db: import("../db/index").PostgresDatabase) {}

  private get schema() {
    // Lazy import to avoid bundling issues
    return require("../db/schema") as typeof import("../db/schema");
  }

  async listConfigs(workspaceId?: string): Promise<GitHubWebhookConfig[]> {
    const { githubWebhookConfigs } = this.schema;
    const rows = workspaceId
      ? await this.db.select().from(githubWebhookConfigs).where(eq(githubWebhookConfigs.workspaceId, workspaceId))
      : await this.db.select().from(githubWebhookConfigs);
    return rows.map(this.rowToConfig);
  }

  async getConfig(id: string): Promise<GitHubWebhookConfig | undefined> {
    const { githubWebhookConfigs } = this.schema;
    const rows = await this.db.select().from(githubWebhookConfigs).where(eq(githubWebhookConfigs.id, id)).limit(1);
    return rows[0] ? this.rowToConfig(rows[0]) : undefined;
  }

  async createConfig(input: CreateWebhookConfigInput): Promise<GitHubWebhookConfig> {
    const { githubWebhookConfigs } = this.schema;
    const id = uuidv4();
    const now = new Date();
    await this.db.insert(githubWebhookConfigs).values({
      id,
      name: input.name,
      repo: input.repo,
      githubToken: input.githubToken,
      webhookSecret: input.webhookSecret ?? "",
      eventTypes: input.eventTypes,
      labelFilter: input.labelFilter ?? [],
      triggerAgentId: input.triggerAgentId,
      workspaceId: input.workspaceId,
      enabled: input.enabled ?? true,
      promptTemplate: input.promptTemplate,
      createdAt: now,
      updatedAt: now,
    });
    return (await this.getConfig(id))!;
  }

  async updateConfig(input: UpdateWebhookConfigInput): Promise<GitHubWebhookConfig | undefined> {
    const { githubWebhookConfigs } = this.schema;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData["name"] = input.name;
    if (input.repo !== undefined) updateData["repo"] = input.repo;
    if (input.githubToken !== undefined) updateData["githubToken"] = input.githubToken;
    if (input.webhookSecret !== undefined) updateData["webhookSecret"] = input.webhookSecret;
    if (input.eventTypes !== undefined) updateData["eventTypes"] = input.eventTypes;
    if (input.labelFilter !== undefined) updateData["labelFilter"] = input.labelFilter;
    if (input.triggerAgentId !== undefined) updateData["triggerAgentId"] = input.triggerAgentId;
    if (input.workspaceId !== undefined) updateData["workspaceId"] = input.workspaceId;
    if (input.enabled !== undefined) updateData["enabled"] = input.enabled;
    if (input.promptTemplate !== undefined) updateData["promptTemplate"] = input.promptTemplate;

    await this.db
      .update(githubWebhookConfigs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where(eq(githubWebhookConfigs.id, input.id));
    return this.getConfig(input.id);
  }

  async deleteConfig(id: string): Promise<void> {
    const { githubWebhookConfigs } = this.schema;
    await this.db.delete(githubWebhookConfigs).where(eq(githubWebhookConfigs.id, id));
  }

  async appendLog(log: Omit<WebhookTriggerLog, "id" | "createdAt">): Promise<WebhookTriggerLog> {
    const { webhookTriggerLogs } = this.schema;
    const id = uuidv4();
    const createdAt = new Date();
    await this.db.insert(webhookTriggerLogs).values({
      id,
      configId: log.configId,
      eventType: log.eventType,
      eventAction: log.eventAction,
      payload: log.payload,
      backgroundTaskId: log.backgroundTaskId,
      signatureValid: log.signatureValid,
      outcome: log.outcome,
      errorMessage: log.errorMessage,
      createdAt,
    });
    return { ...log, id, createdAt };
  }

  async listLogs(configId?: string, limit = 50): Promise<WebhookTriggerLog[]> {
    const { webhookTriggerLogs } = this.schema;
    const rows = configId
      ? await this.db
          .select()
          .from(webhookTriggerLogs)
          .where(eq(webhookTriggerLogs.configId, configId))
          .orderBy(desc(webhookTriggerLogs.createdAt))
          .limit(limit)
      : await this.db
          .select()
          .from(webhookTriggerLogs)
          .orderBy(desc(webhookTriggerLogs.createdAt))
          .limit(limit);
    return rows.map(this.rowToLog);
  }

  // ─── Row mappers ──────────────────────────────────────────────────────────

  private rowToConfig(row: Record<string, unknown>): GitHubWebhookConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      repo: row.repo as string,
      githubToken: (row.githubToken as string) ?? "",
      webhookSecret: (row.webhookSecret as string) ?? "",
      eventTypes: (row.eventTypes as string[]) ?? [],
      labelFilter: (row.labelFilter as string[]) ?? [],
      triggerAgentId: row.triggerAgentId as string,
      workspaceId: row.workspaceId as string | undefined,
      enabled: Boolean(row.enabled),
      promptTemplate: row.promptTemplate as string | undefined,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  }

  private rowToLog(row: Record<string, unknown>): WebhookTriggerLog {
    return {
      id: row.id as string,
      configId: row.configId as string,
      eventType: row.eventType as string,
      eventAction: row.eventAction as string | undefined,
      payload: (row.payload as Record<string, unknown>) ?? {},
      backgroundTaskId: row.backgroundTaskId as string | undefined,
      signatureValid: Boolean(row.signatureValid),
      outcome: row.outcome as WebhookTriggerLog["outcome"],
      errorMessage: row.errorMessage as string | undefined,
      createdAt: row.createdAt as Date,
    };
  }
}

// ─── SQLite Store ─────────────────────────────────────────────────────────────

export class SqliteGitHubWebhookStore {
  constructor(private db: import("drizzle-orm/better-sqlite3").BetterSQLite3Database<typeof import("../db/sqlite-schema")>) {}

  private get schema() {
    return require("../db/sqlite-schema") as typeof import("../db/sqlite-schema");
  }

  async listConfigs(workspaceId?: string): Promise<GitHubWebhookConfig[]> {
    const { githubWebhookConfigs } = this.schema;
    const rows = workspaceId
      ? this.db.select().from(githubWebhookConfigs).where(eq(githubWebhookConfigs.workspaceId, workspaceId)).all()
      : this.db.select().from(githubWebhookConfigs).all();
    return rows.map(this.rowToConfig);
  }

  async getConfig(id: string): Promise<GitHubWebhookConfig | undefined> {
    const { githubWebhookConfigs } = this.schema;
    const row = this.db.select().from(githubWebhookConfigs).where(eq(githubWebhookConfigs.id, id)).get();
    return row ? this.rowToConfig(row) : undefined;
  }

  async createConfig(input: CreateWebhookConfigInput): Promise<GitHubWebhookConfig> {
    const { githubWebhookConfigs } = this.schema;
    const id = uuidv4();
    const now = new Date();
    this.db.insert(githubWebhookConfigs).values({
      id,
      name: input.name,
      repo: input.repo,
      githubToken: input.githubToken,
      webhookSecret: input.webhookSecret ?? "",
      eventTypes: input.eventTypes,
      labelFilter: input.labelFilter ?? [],
      triggerAgentId: input.triggerAgentId,
      workspaceId: input.workspaceId,
      enabled: input.enabled ?? true,
      promptTemplate: input.promptTemplate,
      createdAt: now,
      updatedAt: now,
    }).run();
    return (await this.getConfig(id))!;
  }

  async updateConfig(input: UpdateWebhookConfigInput): Promise<GitHubWebhookConfig | undefined> {
    const { githubWebhookConfigs } = this.schema;
    const updateData: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) updateData.name = input.name;
    if (input.repo !== undefined) updateData.repo = input.repo;
    if (input.githubToken !== undefined) updateData.githubToken = input.githubToken;
    if (input.webhookSecret !== undefined) updateData.webhookSecret = input.webhookSecret;
    if (input.eventTypes !== undefined) updateData.eventTypes = input.eventTypes;
    if (input.labelFilter !== undefined) updateData.labelFilter = input.labelFilter;
    if (input.triggerAgentId !== undefined) updateData.triggerAgentId = input.triggerAgentId;
    if (input.workspaceId !== undefined) updateData.workspaceId = input.workspaceId;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;
    if (input.promptTemplate !== undefined) updateData.promptTemplate = input.promptTemplate;

    this.db
      .update(githubWebhookConfigs)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .set(updateData as any)
      .where(eq(githubWebhookConfigs.id, input.id))
      .run();
    return this.getConfig(input.id);
  }

  async deleteConfig(id: string): Promise<void> {
    const { githubWebhookConfigs } = this.schema;
    this.db.delete(githubWebhookConfigs).where(eq(githubWebhookConfigs.id, id)).run();
  }

  async appendLog(log: Omit<WebhookTriggerLog, "id" | "createdAt">): Promise<WebhookTriggerLog> {
    const { webhookTriggerLogs } = this.schema;
    const id = uuidv4();
    const createdAt = new Date();
    this.db.insert(webhookTriggerLogs).values({
      id,
      configId: log.configId,
      eventType: log.eventType,
      eventAction: log.eventAction,
      payload: log.payload,
      backgroundTaskId: log.backgroundTaskId,
      signatureValid: log.signatureValid,
      outcome: log.outcome,
      errorMessage: log.errorMessage,
      createdAt,
    }).run();
    return { ...log, id, createdAt };
  }

  async listLogs(configId?: string, limit = 50): Promise<WebhookTriggerLog[]> {
    const { webhookTriggerLogs } = this.schema;
    const rows = configId
      ? this.db
          .select()
          .from(webhookTriggerLogs)
          .where(eq(webhookTriggerLogs.configId, configId))
          .orderBy(desc(webhookTriggerLogs.createdAt))
          .limit(limit)
          .all()
      : this.db
          .select()
          .from(webhookTriggerLogs)
          .orderBy(desc(webhookTriggerLogs.createdAt))
          .limit(limit)
          .all();
    return rows.map(this.rowToLog);
  }

  // ─── Row mappers ──────────────────────────────────────────────────────────

  private rowToConfig(row: Record<string, unknown>): GitHubWebhookConfig {
    return {
      id: row.id as string,
      name: row.name as string,
      repo: row.repo as string,
      githubToken: row.githubToken as string,
      webhookSecret: (row.webhookSecret as string) ?? "",
      eventTypes: Array.isArray(row.eventTypes) ? (row.eventTypes as string[]) : JSON.parse((row.eventTypes as string) ?? "[]"),
      labelFilter: Array.isArray(row.labelFilter) ? (row.labelFilter as string[]) : JSON.parse((row.labelFilter as string) ?? "[]"),
      triggerAgentId: row.triggerAgentId as string,
      workspaceId: row.workspaceId as string | undefined,
      enabled: Boolean(row.enabled),
      promptTemplate: row.promptTemplate as string | undefined,
      createdAt: row.createdAt as Date,
      updatedAt: row.updatedAt as Date,
    };
  }

  private rowToLog(row: Record<string, unknown>): WebhookTriggerLog {
    return {
      id: row.id as string,
      configId: row.configId as string,
      eventType: row.eventType as string,
      eventAction: row.eventAction as string | undefined,
      payload: typeof row.payload === "string" ? JSON.parse(row.payload) : (row.payload as Record<string, unknown>) ?? {},
      backgroundTaskId: row.backgroundTaskId as string | undefined,
      signatureValid: Boolean(row.signatureValid),
      outcome: row.outcome as WebhookTriggerLog["outcome"],
      errorMessage: row.errorMessage as string | undefined,
      createdAt: row.createdAt as Date,
    };
  }
}

// ─── Union Store Type ─────────────────────────────────────────────────────────

export type GitHubWebhookStore = InMemoryGitHubWebhookStore | PgGitHubWebhookStore | SqliteGitHubWebhookStore;
