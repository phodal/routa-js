/**
 * Custom MCP Server Store - Database-backed custom MCP server configuration storage.
 *
 * Manages user-defined MCP server configurations in the database.
 * Supports CRUD operations and merging with built-in MCP servers.
 */

import { eq, and } from "drizzle-orm";
import type { PostgresDatabase } from "../db";
import { customMcpServers } from "../db/schema";

// ─── Types ─────────────────────────────────────────────────────────────────

export type McpServerType = "stdio" | "http" | "sse";

export interface CustomMcpServerConfig {
  id: string;
  name: string;
  description?: string;
  type: McpServerType;
  /** Command (for stdio) */
  command?: string;
  /** Arguments (for stdio) */
  args?: string[];
  /** URL (for http/sse) */
  url?: string;
  /** HTTP headers (for http/sse) */
  headers?: Record<string, string>;
  /** Environment variables */
  env?: Record<string, string>;
  /** Whether this server is enabled */
  enabled: boolean;
  /** Workspace scope (undefined = global) */
  workspaceId?: string;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CustomMcpServerCreateInput {
  id: string;
  name: string;
  description?: string;
  type: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
  workspaceId?: string;
}

export interface CustomMcpServerUpdateInput {
  name?: string;
  description?: string;
  type?: McpServerType;
  command?: string;
  args?: string[];
  url?: string;
  headers?: Record<string, string>;
  env?: Record<string, string>;
  enabled?: boolean;
}

// ─── Store Interface ───────────────────────────────────────────────────────

export interface CustomMcpServerStore {
  create(input: CustomMcpServerCreateInput): Promise<CustomMcpServerConfig>;
  get(id: string): Promise<CustomMcpServerConfig | null>;
  list(workspaceId?: string): Promise<CustomMcpServerConfig[]>;
  update(id: string, input: CustomMcpServerUpdateInput): Promise<CustomMcpServerConfig | null>;
  delete(id: string): Promise<boolean>;
  upsert(input: CustomMcpServerCreateInput): Promise<CustomMcpServerConfig>;
  listEnabled(workspaceId?: string): Promise<CustomMcpServerConfig[]>;
}

// ─── Postgres Implementation ───────────────────────────────────────────────

export class PostgresCustomMcpServerStore implements CustomMcpServerStore {
  constructor(private db: PostgresDatabase) {}

  async create(input: CustomMcpServerCreateInput): Promise<CustomMcpServerConfig> {
    const now = new Date();
    const record = {
      id: input.id,
      name: input.name,
      description: input.description ?? null,
      type: input.type,
      command: input.command ?? null,
      args: input.args ?? null,
      url: input.url ?? null,
      headers: input.headers ?? null,
      env: input.env ?? null,
      enabled: input.enabled ?? true,
      workspaceId: input.workspaceId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await this.db.insert(customMcpServers).values(record);
    return this.toConfig(record);
  }

  async get(id: string): Promise<CustomMcpServerConfig | null> {
    const results = await this.db
      .select()
      .from(customMcpServers)
      .where(eq(customMcpServers.id, id))
      .limit(1);

    if (results.length === 0) return null;
    return this.toConfig(results[0]);
  }

  async list(workspaceId?: string): Promise<CustomMcpServerConfig[]> {
    const results = workspaceId
      ? await this.db.select().from(customMcpServers).where(eq(customMcpServers.workspaceId, workspaceId))
      : await this.db.select().from(customMcpServers);

    return results.map((r) => this.toConfig(r));
  }

  async listEnabled(workspaceId?: string): Promise<CustomMcpServerConfig[]> {
    const conditions = [eq(customMcpServers.enabled, true)];
    if (workspaceId) {
      conditions.push(eq(customMcpServers.workspaceId, workspaceId));
    }
    const results = await this.db
      .select()
      .from(customMcpServers)
      .where(and(...conditions));

    return results.map((r) => this.toConfig(r));
  }

  async update(id: string, input: CustomMcpServerUpdateInput): Promise<CustomMcpServerConfig | null> {
    const existing = await this.get(id);
    if (!existing) return null;

    const updateData: Record<string, unknown> = { updatedAt: new Date() };

    if (input.name !== undefined) updateData.name = input.name;
    if (input.description !== undefined) updateData.description = input.description;
    if (input.type !== undefined) updateData.type = input.type;
    if (input.command !== undefined) updateData.command = input.command;
    if (input.args !== undefined) updateData.args = input.args;
    if (input.url !== undefined) updateData.url = input.url;
    if (input.headers !== undefined) updateData.headers = input.headers;
    if (input.env !== undefined) updateData.env = input.env;
    if (input.enabled !== undefined) updateData.enabled = input.enabled;

    await this.db.update(customMcpServers).set(updateData).where(eq(customMcpServers.id, id));
    return this.get(id);
  }

  async delete(id: string): Promise<boolean> {
    await this.db.delete(customMcpServers).where(eq(customMcpServers.id, id));
    const deleted = await this.get(id);
    return deleted === null;
  }

  async upsert(input: CustomMcpServerCreateInput): Promise<CustomMcpServerConfig> {
    const existing = await this.get(input.id);
    if (existing) {
      return (await this.update(input.id, input))!;
    }
    return this.create(input);
  }

  private toConfig(record: Record<string, unknown>): CustomMcpServerConfig {
    return {
      id: record.id as string,
      name: record.name as string,
      description: (record.description as string) ?? undefined,
      type: record.type as McpServerType,
      command: (record.command as string) ?? undefined,
      args: (record.args as string[]) ?? undefined,
      url: (record.url as string) ?? undefined,
      headers: (record.headers as Record<string, string>) ?? undefined,
      env: (record.env as Record<string, string>) ?? undefined,
      enabled: (record.enabled as boolean) ?? true,
      workspaceId: (record.workspaceId as string) ?? undefined,
      createdAt: record.createdAt as Date | undefined,
      updatedAt: record.updatedAt as Date | undefined,
    };
  }
}

// ─── Custom MCP Manager ───────────────────────────────────────────────────

/**
 * Merge built-in MCP servers with custom user-defined servers.
 *
 * Merging strategy: built-in servers always take priority over custom servers
 * with the same name (to protect "routa-coordination" from being overridden).
 *
 * Returns a merged record of server-name → config object suitable for injection
 * into provider-specific MCP configuration.
 */
export function mergeCustomMcpServers(
  builtInServers: Record<string, unknown>,
  customServers: CustomMcpServerConfig[],
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...builtInServers };

  for (const server of customServers) {
    if (!server.enabled) continue;
    // Built-in servers take priority
    if (merged[server.name]) continue;

    if (server.type === "stdio") {
      merged[server.name] = {
        type: "stdio",
        command: server.command,
        args: server.args ?? [],
        ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
      };
    } else {
      // http / sse
      merged[server.name] = {
        type: server.type,
        url: server.url,
        ...(server.env && Object.keys(server.env).length > 0 ? { env: server.env } : {}),
        ...(server.headers && Object.keys(server.headers).length > 0 ? { headers: server.headers } : {}),
      };
    }
  }

  return merged;
}
