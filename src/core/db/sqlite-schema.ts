/**
 * Drizzle ORM SQLite Schema — All tables for the Routa multi-agent system.
 *
 * Mirrors the Postgres schema (schema.ts) but uses SQLite-compatible types.
 * Used for desktop deployments (Tauri, Electron) where a local SQLite database
 * is preferred over a remote Postgres instance.
 *
 * Key differences from Postgres schema:
 * - Uses sqliteTable instead of pgTable
 * - Uses integer for timestamps (Unix epoch milliseconds)
 * - Uses text for JSONB columns (JSON serialized as text)
 * - Uses integer for boolean columns (0/1)
 */

import {
  sqliteTable,
  text,
  integer,
  primaryKey,
} from "drizzle-orm/sqlite-core";

// ─── Workspaces ─────────────────────────────────────────────────────

export const workspaces = sqliteTable("workspaces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Codebases ──────────────────────────────────────────────────────

export const codebases = sqliteTable("codebases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  repoPath: text("repo_path").notNull(),
  branch: text("branch"),
  label: text("label"),
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  sourceType: text("source_type"),   // "local" | "github" — null treated as "local"
  sourceUrl: text("source_url"),     // e.g. "https://github.com/owner/repo"
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Agents ─────────────────────────────────────────────────────────

export const agents = sqliteTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  modelTier: text("model_tier").notNull().default("SMART"),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  status: text("status").notNull().default("PENDING"),
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Tasks ──────────────────────────────────────────────────────────

export const tasks = sqliteTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  scope: text("scope"),
  acceptanceCriteria: text("acceptance_criteria", { mode: "json" }).$type<string[]>(),
  verificationCommands: text("verification_commands", { mode: "json" }).$type<string[]>(),
  assignedTo: text("assigned_to"),
  status: text("status").notNull().default("PENDING"),
  dependencies: text("dependencies", { mode: "json" }).$type<string[]>().default([]),
  parallelGroup: text("parallel_group"),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** Session ID that created this task (for session-scoped filtering) */
  sessionId: text("session_id"),
  completionSummary: text("completion_summary"),
  verificationVerdict: text("verification_verdict"),
  verificationReport: text("verification_report"),
  version: integer("version").notNull().default(1),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Notes ──────────────────────────────────────────────────────────

export const notes = sqliteTable("notes", {
  id: text("id").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  /** Session ID that created this note (for session-scoped grouping) */
  sessionId: text("session_id"),
  title: text("title").notNull(),
  content: text("content").notNull().default(""),
  type: text("type").notNull().default("general"),
  taskStatus: text("task_status"),
  assignedAgentIds: text("assigned_agent_ids", { mode: "json" }).$type<string[]>(),
  parentNoteId: text("parent_note_id"),
  linkedTaskId: text("linked_task_id"),
  customMetadata: text("custom_metadata", { mode: "json" }).$type<Record<string, string>>(),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Messages (Conversation) ────────────────────────────────────────

export const messages = sqliteTable("messages", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull(),
  content: text("content").notNull(),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  toolName: text("tool_name"),
  toolArgs: text("tool_args"),
  turn: integer("turn"),
});

// ─── Event Subscriptions ────────────────────────────────────────────

export const eventSubscriptions = sqliteTable("event_subscriptions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  eventTypes: text("event_types", { mode: "json" }).$type<string[]>().notNull(),
  excludeSelf: integer("exclude_self", { mode: "boolean" }).notNull().default(true),
  oneShot: integer("one_shot", { mode: "boolean" }).notNull().default(false),
  waitGroupId: text("wait_group_id"),
  priority: integer("priority").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Pending Events (buffered for agent polling) ────────────────────

export const pendingEvents = sqliteTable("pending_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  eventType: text("event_type").notNull(),
  sourceAgentId: text("source_agent_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  timestamp: integer("timestamp", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── ACP Sessions ─────────────────────────────────────────────────────

export interface AcpSessionNotification {
  sessionId: string;
  update?: Record<string, unknown>;
  [key: string]: unknown;
}

export const acpSessions = sqliteTable("acp_sessions", {
  id: text("id").primaryKey(),
  /** User-editable display name */
  name: text("name"),
  cwd: text("cwd").notNull(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  routaAgentId: text("routa_agent_id"),
  provider: text("provider"),
  role: text("role"),
  modeId: text("mode_id"),
  /** Model used for this session */
  model: text("model"),
  /** Whether the first prompt has been sent */
  firstPromptSent: integer("first_prompt_sent", { mode: "boolean" }).default(false),
  /** Message history stored as JSON array */
  messageHistory: text("message_history", { mode: "json" }).$type<AcpSessionNotification[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Skills ───────────────────────────────────────────────────────────

export interface SkillFileEntry {
  /** Relative path within the skill (e.g., "SKILL.md", "examples/usage.md") */
  path: string;
  /** File content */
  content: string;
}

export const skills = sqliteTable("skills", {
  /** Skill name (unique identifier, e.g., "mysql-best-practices") */
  id: text("id").primaryKey(),
  /** Human-readable name */
  name: text("name").notNull(),
  /** Short description extracted from SKILL.md frontmatter */
  description: text("description").notNull().default(""),
  /** Source repository (e.g., "mindrally/skills") */
  source: text("source").notNull(),
  /** Catalog type: "skillssh" | "github" | "local" */
  catalogType: text("catalog_type").notNull().default("skillssh"),
  /** All files in the skill directory, stored as JSON array */
  files: text("files", { mode: "json" }).$type<SkillFileEntry[]>().notNull().default([]),
  /** Optional license from SKILL.md frontmatter */
  license: text("license"),
  /** Additional metadata from SKILL.md frontmatter */
  metadata: text("metadata", { mode: "json" }).$type<Record<string, string>>().default({}),
  /** Installation count (for analytics) */
  installs: integer("installs").notNull().default(0),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});

// ─── Workspace Skills (many-to-many) ────────────────────────────────

export const workspaceSkills = sqliteTable("workspace_skills", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  installedAt: integer("installed_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.skillId] })]);

// ─── Specialists (user-defined agent specialist configurations) ───────────

export const specialists = sqliteTable("specialists", {
  /** Unique identifier (e.g., "routa", "crafter", or custom ID) */
  id: text("id").primaryKey(),
  /** Human-readable name */
  name: text("name").notNull(),
  /** Short description */
  description: text("description").notNull().default(""),
  /** Source of this specialist: "user" | "bundled" | "hardcoded" */
  source: text("source").notNull().default("user"),
  /** Agent role: "ROUTA" | "CRAFTER" | "GATE" | "DEVELOPER" */
  role: text("role").notNull(),
  /** Default model tier: "FAST" | "BALANCED" | "SMART" */
  defaultModelTier: text("default_model_tier").notNull().default("SMART"),
  /** System prompt / behavior prompt */
  systemPrompt: text("system_prompt").notNull(),
  /** Short role reminder */
  roleReminder: text("role_reminder").notNull().default(""),
  /** Optional specific model override */
  model: text("model"),
  /** Whether this specialist is enabled (stored as 0/1) */
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  /** Created by user ID (for future multi-tenant support) */
  createdBy: text("created_by"),
  /** Creation timestamp */
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
  /** Last update timestamp */
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull().$defaultFn(() => new Date()),
});
