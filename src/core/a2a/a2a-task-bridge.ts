/**
 * A2ATaskBridge - maps Routa agents/tasks to A2A protocol tasks
 *
 * This bridge exposes existing Routa agents as A2A-compatible tasks.
 * When a message is sent via the A2A protocol, a Routa agent is created
 * and tracked as an A2A Task.
 */

import { v4 as uuidv4 } from "uuid";
import { AgentStatus, AgentRole } from "../models/agent";

// ─── A2A Task Types ──────────────────────────────────────────────────────────

export type A2ATaskState =
  | "submitted"
  | "working"
  | "input-required"
  | "completed"
  | "failed"
  | "canceled"
  | "rejected"
  | "auth-required";

export interface A2APart {
  text?: string;
  data?: unknown;
  mediaType?: string;
}

export interface A2AMessage {
  messageId: string;
  role: "user" | "agent";
  parts: A2APart[];
  contextId?: string;
  taskId?: string;
}

export interface A2AArtifact {
  artifactId: string;
  name: string;
  description?: string;
  parts: A2APart[];
}

export interface A2ATaskStatus {
  state: A2ATaskState;
  timestamp: string;
  message?: A2AMessage;
}

export interface A2ATask {
  id: string;
  contextId: string;
  status: A2ATaskStatus;
  history: A2AMessage[];
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

// Internal record linking A2A task to Routa agent
interface A2ATaskRecord extends A2ATask {
  /** Linked Routa agent ID (if any) */
  _routaAgentId?: string;
  /** Linked workspace ID */
  _workspaceId?: string;
  /** Original user message text */
  _userPrompt?: string;
}

// ─── State Mapping ───────────────────────────────────────────────────────────

export function mapAgentStatusToA2AState(status: AgentStatus): A2ATaskState {
  switch (status) {
    case AgentStatus.PENDING:
      return "submitted";
    case AgentStatus.ACTIVE:
      return "working";
    case AgentStatus.COMPLETED:
      return "completed";
    case AgentStatus.ERROR:
      return "failed";
    case AgentStatus.CANCELLED:
      return "canceled";
    default:
      return "submitted";
  }
}

export function mapAgentRoleToSkillId(role: AgentRole): string {
  switch (role) {
    case AgentRole.ROUTA:
      return "coordination";
    case AgentRole.CRAFTER:
      return "development";
    case AgentRole.GATE:
      return "verification";
    case AgentRole.DEVELOPER:
      return "full-stack-development";
    default:
      return "coordination";
  }
}

// ─── A2ATaskBridge ───────────────────────────────────────────────────────────

export class A2ATaskBridge {
  private tasks = new Map<string, A2ATaskRecord>();

  /**
   * Create a new A2A task record linked to a Routa agent
   */
  createTask(params: {
    userPrompt: string;
    workspaceId?: string;
    routaAgentId?: string;
    contextId?: string;
  }): A2ATask {
    const taskId = uuidv4();
    const contextId = params.contextId ?? uuidv4();
    const messageId = uuidv4();
    const now = new Date().toISOString();

    const userMessage: A2AMessage = {
      messageId,
      role: "user",
      parts: [{ text: params.userPrompt }],
      contextId,
      taskId,
    };

    const task: A2ATaskRecord = {
      id: taskId,
      contextId,
      status: {
        state: "submitted",
        timestamp: now,
      },
      history: [userMessage],
      artifacts: [],
      metadata: {
        workspaceId: params.workspaceId,
      },
      _routaAgentId: params.routaAgentId,
      _workspaceId: params.workspaceId,
      _userPrompt: params.userPrompt,
    };

    this.tasks.set(taskId, task);
    return this.toPublicTask(task);
  }

  /**
   * Update an A2A task's state based on the linked Routa agent's status
   */
  updateTaskFromAgent(
    taskId: string,
    agentStatus: AgentStatus,
    agentName?: string
  ): A2ATask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const newState = mapAgentStatusToA2AState(agentStatus);
    task.status = {
      state: newState,
      timestamp: new Date().toISOString(),
      message: agentName
        ? {
            messageId: uuidv4(),
            role: "agent",
            parts: [{ text: `Agent ${agentName} is ${newState}` }],
          }
        : undefined,
    };

    // Add an artifact on completion
    if (newState === "completed" && task._userPrompt) {
      task.artifacts = [
        {
          artifactId: uuidv4(),
          name: "Agent Result",
          description: "The agent has completed the task",
          parts: [
            {
              text: `Agent successfully processed: ${task._userPrompt}`,
            },
          ],
        },
      ];
    }

    this.tasks.set(taskId, task);
    return this.toPublicTask(task);
  }

  /**
   * Register an existing Routa agent as an A2A task (for discovery)
   */
  registerAgentAsTask(agent: {
    id: string;
    name: string;
    role: AgentRole;
    status: AgentStatus;
    workspaceId: string;
    createdAt: Date;
    metadata?: Record<string, string>;
  }): A2ATask {
    // Check if already registered
    for (const [_, record] of this.tasks) {
      if (record._routaAgentId === agent.id) {
        // Update status
        const updated = this.updateTaskFromAgent(record.id, agent.status, agent.name);
        if (updated) return updated;
      }
    }

    // Create new task record for this agent
    const taskId = uuidv4();
    const contextId = uuidv4();
    const now = agent.createdAt.toISOString();
    const state = mapAgentStatusToA2AState(agent.status);

    const userMessage: A2AMessage = {
      messageId: uuidv4(),
      role: "user",
      parts: [
        {
          text: `Agent "${agent.name}" created with role ${agent.role}`,
        },
      ],
      contextId,
      taskId,
    };

    const agentMessage: A2AMessage = {
      messageId: uuidv4(),
      role: "agent",
      parts: [
        {
          text: `I am ${agent.name}, a ${agent.role} agent. I am ready to work.`,
        },
      ],
      contextId,
      taskId,
    };

    const task: A2ATaskRecord = {
      id: taskId,
      contextId,
      status: {
        state,
        timestamp: now,
      },
      history: [userMessage, agentMessage],
      artifacts: state === "completed" ? [
        {
          artifactId: uuidv4(),
          name: "Agent Summary",
          parts: [{ text: `Agent ${agent.name} (${agent.role}) completed successfully` }],
        },
      ] : [],
      metadata: {
        workspaceId: agent.workspaceId,
        agentName: agent.name,
        agentRole: agent.role,
        skillId: mapAgentRoleToSkillId(agent.role),
      },
      _routaAgentId: agent.id,
      _workspaceId: agent.workspaceId,
      _userPrompt: `Create ${agent.role} agent: ${agent.name}`,
    };

    this.tasks.set(taskId, task);
    return this.toPublicTask(task);
  }

  /**
   * Get a task by ID
   */
  getTask(taskId: string): A2ATask | undefined {
    const task = this.tasks.get(taskId);
    return task ? this.toPublicTask(task) : undefined;
  }

  /**
   * Get the routa agent ID linked to an A2A task
   */
  getRoutaAgentId(taskId: string): string | undefined {
    return this.tasks.get(taskId)?._routaAgentId;
  }

  /**
   * List all tasks, optionally filtered by workspaceId or contextId
   */
  listTasks(filter?: { workspaceId?: string; contextId?: string; state?: string }): A2ATask[] {
    const results: A2ATask[] = [];
    for (const task of this.tasks.values()) {
      if (filter?.workspaceId && task._workspaceId !== filter.workspaceId) continue;
      if (filter?.contextId && task.contextId !== filter.contextId) continue;
      if (filter?.state && task.status.state !== filter.state) continue;
      results.push(this.toPublicTask(task));
    }
    // Sort by most recently updated first
    return results.sort((a, b) =>
      new Date(b.status.timestamp).getTime() - new Date(a.status.timestamp).getTime()
    );
  }

  /**
   * Link a Routa agent to an existing A2A task
   */
  linkAgent(taskId: string, agentId: string): void {
    const task = this.tasks.get(taskId);
    if (task) {
      task._routaAgentId = agentId;
      this.tasks.set(taskId, task);
    }
  }

  /**
   * Cancel a task
   */
  cancelTask(taskId: string): A2ATask | undefined {
    const task = this.tasks.get(taskId);
    if (!task) return undefined;

    const terminal = ["completed", "failed", "canceled", "rejected"];
    if (terminal.includes(task.status.state)) {
      throw new Error("TaskNotCancelableError");
    }

    task.status = {
      state: "canceled",
      timestamp: new Date().toISOString(),
    };
    this.tasks.set(taskId, task);
    return this.toPublicTask(task);
  }

  /**
   * Strip internal fields from task record
   */
  private toPublicTask(record: A2ATaskRecord): A2ATask {
    return {
      id: record.id,
      contextId: record.contextId,
      status: record.status,
      history: record.history,
      artifacts: record.artifacts,
      metadata: record.metadata,
    };
  }

  /**
   * Number of tasks tracked
   */
  get size(): number {
    return this.tasks.size;
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

const GLOBAL_KEY = "__a2a_task_bridge__";

export function getA2ATaskBridge(): A2ATaskBridge {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new A2ATaskBridge();
  }
  return g[GLOBAL_KEY] as A2ATaskBridge;
}
