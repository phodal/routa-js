/**
 * Drizzle ORM Schema — All tables for the Routa multi-agent system.
 *
 * Uses Neon Serverless Postgres (Vercel's recommended Postgres provider).
 * Every table uses `text` primary keys (UUIDs generated in JS) so that
 * agent/task/workspace IDs stay consistent across the MCP/ACP boundary.
 */

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  primaryKey,
} from "drizzle-orm/pg-core";

// ─── Workspaces ─────────────────────────────────────────────────────

export const workspaces = pgTable("workspaces", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  status: text("status").notNull().default("active"),
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Codebases ──────────────────────────────────────────────────────

export const codebases = pgTable("codebases", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  repoPath: text("repo_path").notNull(),
  branch: text("branch"),
  label: text("label"),
  isDefault: boolean("is_default").notNull().default(false),
  sourceType: text("source_type"),   // "local" | "github" — null treated as "local"
  sourceUrl: text("source_url"),     // e.g. "https://github.com/owner/repo"
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Agents ─────────────────────────────────────────────────────────

export const agents = pgTable("agents", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(), // ROUTA | CRAFTER | GATE | DEVELOPER
  modelTier: text("model_tier").notNull().default("SMART"), // SMART | BALANCED | FAST
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  parentId: text("parent_id"),
  status: text("status").notNull().default("PENDING"), // PENDING | ACTIVE | COMPLETED | ERROR | CANCELLED
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Tasks ──────────────────────────────────────────────────────────

export const tasks = pgTable("tasks", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  objective: text("objective").notNull(),
  scope: text("scope"),
  acceptanceCriteria: jsonb("acceptance_criteria").$type<string[]>(),
  verificationCommands: jsonb("verification_commands").$type<string[]>(),
  assignedTo: text("assigned_to"),
  status: text("status").notNull().default("PENDING"),
  dependencies: jsonb("dependencies").$type<string[]>().default([]),
  parallelGroup: text("parallel_group"),
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  completionSummary: text("completion_summary"),
  verificationVerdict: text("verification_verdict"),
  verificationReport: text("verification_report"),
  /** Optimistic-locking version for atomic updates */
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Notes ──────────────────────────────────────────────────────────

export const notes = pgTable(
  "notes",
  {
    id: text("id").notNull(),
    workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    content: text("content").notNull().default(""),
    type: text("type").notNull().default("general"), // spec | task | general
    taskStatus: text("task_status"),
    assignedAgentIds: jsonb("assigned_agent_ids").$type<string[]>(),
    parentNoteId: text("parent_note_id"),
    linkedTaskId: text("linked_task_id"),
    customMetadata: jsonb("custom_metadata").$type<Record<string, string>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.workspaceId, table.id] })]
);

// ─── Messages (Conversation) ────────────────────────────────────────

export const messages = pgTable("messages", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  role: text("role").notNull(), // SYSTEM | USER | ASSISTANT | TOOL
  content: text("content").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  toolName: text("tool_name"),
  toolArgs: text("tool_args"),
  turn: integer("turn"),
});

// ─── Event Subscriptions ────────────────────────────────────────────

export const eventSubscriptions = pgTable("event_subscriptions", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  agentName: text("agent_name").notNull(),
  eventTypes: jsonb("event_types").$type<string[]>().notNull(),
  excludeSelf: boolean("exclude_self").notNull().default(true),
  /** If true, auto-remove after first matching event delivery */
  oneShot: boolean("one_shot").notNull().default(false),
  /** Group ID for wait-all semantics */
  waitGroupId: text("wait_group_id"),
  /** Higher priority subscriptions are notified first */
  priority: integer("priority").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Pending Events (buffered for agent polling) ────────────────────

export const pendingEvents = pgTable("pending_events", {
  id: text("id").primaryKey(),
  agentId: text("agent_id").notNull(),
  eventType: text("event_type").notNull(),
  sourceAgentId: text("source_agent_id").notNull(),
  workspaceId: text("workspace_id").notNull(),
  data: jsonb("data").$type<Record<string, unknown>>().default({}),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
});

// ─── ACP Sessions ─────────────────────────────────────────────────────

export interface AcpSessionNotification {
  sessionId: string;
  update?: Record<string, unknown>;
  [key: string]: unknown;
}

export const acpSessions = pgTable("acp_sessions", {
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
  firstPromptSent: boolean("first_prompt_sent").default(false),
  /** Message history stored as JSONB array */
  messageHistory: jsonb("message_history").$type<AcpSessionNotification[]>().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Skills ───────────────────────────────────────────────────────────

export interface SkillFileEntry {
  /** Relative path within the skill (e.g., "SKILL.md", "examples/usage.md") */
  path: string;
  /** File content */
  content: string;
}

export const skills = pgTable("skills", {
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
  files: jsonb("files").$type<SkillFileEntry[]>().notNull().default([]),
  /** Optional license from SKILL.md frontmatter */
  license: text("license"),
  /** Additional metadata from SKILL.md frontmatter */
  metadata: jsonb("metadata").$type<Record<string, string>>().default({}),
  /** Installation count (for analytics) */
  installs: integer("installs").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─── Workspace Skills (many-to-many) ────────────────────────────────

export const workspaceSkills = pgTable("workspace_skills", {
  workspaceId: text("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  skillId: text("skill_id").notNull().references(() => skills.id, { onDelete: "cascade" }),
  installedAt: timestamp("installed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.workspaceId, table.skillId] })]);
