/**
 * KanbanWorkflowOrchestrator — Coordinates column automation and task progress.
 *
 * Listens for COLUMN_TRANSITION events and triggers the configured Column Agent
 * for the target column. Tracks active automations and supports auto-advance
 * when an agent completes successfully.
 */

import { EventBus, AgentEventType, AgentEvent } from "../events/event-bus";
import type { KanbanBoardStore } from "../store/kanban-board-store";
import type { TaskStore } from "../store/task-store";
import type { KanbanColumnAutomation } from "../models/kanban";
import { columnIdToTaskStatus } from "../models/kanban";
import type { ColumnTransitionData } from "./column-transition";
import { markTaskLaneSessionStatus } from "./task-lane-history";

/** Represents an active column automation in progress */
export interface ActiveAutomation {
  cardId: string;
  cardTitle: string;
  boardId: string;
  workspaceId: string;
  columnId: string;
  columnName: string;
  automation: KanbanColumnAutomation;
  sessionId?: string;
  startedAt: Date;
  status: "queued" | "running" | "completed" | "failed";
}

/** Callback to create an agent session for a column automation */
export type CreateAutomationSession = (params: {
  workspaceId: string;
  cardId: string;
  cardTitle: string;
  columnId: string;
  columnName: string;
  automation: KanbanColumnAutomation;
}) => Promise<string | null>;

/** Callback to clean up a card's session queue entry before auto-advancing */
export type CleanupCardSession = (cardId: string) => void;

export class KanbanWorkflowOrchestrator {
  private handlerKey = "kanban-workflow-orchestrator";
  private activeAutomations = new Map<string, ActiveAutomation>();
  private started = false;
  private cleanupCardSession?: CleanupCardSession;

  constructor(
    private eventBus: EventBus,
    private kanbanBoardStore: KanbanBoardStore,
    private taskStore: TaskStore,
    private createSession?: CreateAutomationSession,
  ) {}

  /** Start listening for column transition events */
  start(): void {
    if (this.started) {
      return;
    }
    this.eventBus.on(this.handlerKey, (event: AgentEvent) => {
      if (event.type === AgentEventType.COLUMN_TRANSITION) {
        void this.handleColumnTransition(event);
      }
      if (
        event.type === AgentEventType.AGENT_COMPLETED ||
        event.type === AgentEventType.REPORT_SUBMITTED ||
        event.type === AgentEventType.AGENT_FAILED ||
        event.type === AgentEventType.AGENT_TIMEOUT
      ) {
        void this.handleAgentCompletion(event);
      }
    });
    this.started = true;
  }

  /** Stop listening */
  stop(): void {
    if (!this.started) {
      return;
    }
    this.eventBus.off(this.handlerKey);
    this.activeAutomations.clear();
    this.started = false;
  }

  /** Set the session creation callback */
  setCreateSession(fn: CreateAutomationSession): void {
    this.createSession = fn;
  }

  /** Set the cleanup callback for session queue entries */
  setCleanupCardSession(fn: CleanupCardSession): void {
    this.cleanupCardSession = fn;
  }

  /** Get all active automations */
  getActiveAutomations(): ActiveAutomation[] {
    return Array.from(this.activeAutomations.values());
  }

  /** Get active automation for a specific card */
  getAutomationForCard(cardId: string): ActiveAutomation | undefined {
    return this.activeAutomations.get(cardId);
  }

  private async handleColumnTransition(event: AgentEvent): Promise<void> {
    const data = event.data as unknown as ColumnTransitionData;
    const board = await this.kanbanBoardStore.get(data.boardId);
    if (!board) return;

    const targetColumn = board.columns.find((c) => c.id === data.toColumnId);
    if (!targetColumn?.automation?.enabled) return;

    const automation = targetColumn.automation;
    const transitionType = automation.transitionType ?? "entry";

    // Only trigger on entry or both
    if (transitionType !== "entry" && transitionType !== "both") return;

    const automationEntry: ActiveAutomation = {
      cardId: data.cardId,
      cardTitle: data.cardTitle,
      boardId: data.boardId,
      workspaceId: data.workspaceId,
      columnId: targetColumn.id,
      columnName: targetColumn.name,
      automation,
      startedAt: new Date(),
      status: "queued",
    };

    this.activeAutomations.set(data.cardId, automationEntry);

    // Trigger agent session if callback is available
    if (this.createSession) {
      try {
        const sessionId = await this.createSession({
          workspaceId: data.workspaceId,
          cardId: data.cardId,
          cardTitle: data.cardTitle,
          columnId: targetColumn.id,
          columnName: targetColumn.name,
          automation,
        });
        if (sessionId) {
          automationEntry.status = "running";
          automationEntry.sessionId = sessionId ?? undefined;
        }
      } catch (err) {
        automationEntry.status = "failed";
        console.error("[WorkflowOrchestrator] Failed to create session:", err);
      }
    }
  }

  private async handleAgentCompletion(event: AgentEvent): Promise<void> {
    // Find any active automation that matches this agent's session
    for (const [cardId, automation] of this.activeAutomations.entries()) {
      if (automation.status === "completed" || automation.status === "failed") continue;

      const eventSessionId = typeof event.data?.sessionId === "string" ? event.data.sessionId : undefined;
      if (!eventSessionId) continue;

      const task = await this.taskStore.get(cardId);
      const sessionId = automation.sessionId ?? task?.triggerSessionId;
      if (!automation.sessionId && sessionId) {
        automation.sessionId = sessionId;
        automation.status = "running";
      }

      // Match only by the automation's own sessionId or the card's current triggerSessionId.
      // Do NOT match by sessionIds history to avoid a previous column's AGENT_COMPLETED
      // event accidentally completing the current column's automation.
      const isRelated = Boolean(sessionId && eventSessionId === sessionId);

      if (!isRelated) continue;

      const success = event.type !== AgentEventType.AGENT_FAILED && event.type !== AgentEventType.AGENT_TIMEOUT && event.data?.success !== false;
      automation.status = success ? "completed" : "failed";
      if (task) {
        markTaskLaneSessionStatus(
          task,
          sessionId,
          event.type === AgentEventType.AGENT_TIMEOUT
            ? "timed_out"
            : success
              ? "completed"
              : "failed",
        );
        await this.taskStore.save(task);
      }

      // Auto-advance if configured and successful
      if (success && automation.automation.autoAdvanceOnSuccess) {
        await this.autoAdvanceCard(cardId, automation);
      }

      // Clean up completed automations after a delay
      const completedAutomation = automation;
      setTimeout(() => {
        if (this.activeAutomations.get(cardId) === completedAutomation) {
          this.activeAutomations.delete(cardId);
        }
      }, 30_000);
    }
  }

  private async autoAdvanceCard(
    cardId: string,
    automation: ActiveAutomation,
  ): Promise<void> {
    try {
      const board = await this.kanbanBoardStore.get(automation.boardId);
      if (!board) return;

      // Check if the card was already moved by the specialist (via move_card tool)
      const task = await this.taskStore.get(cardId);
      if (!task) return;

      // If the card is no longer in the automation's column, it was already moved by the specialist
      if (task.columnId !== automation.columnId) {
        return;
      }

      const currentColumn = board.columns.find((c) => c.id === automation.columnId);
      if (!currentColumn) return;

      // Find the next column by position
      const sortedColumns = board.columns
        .slice()
        .sort((a, b) => a.position - b.position);
      const currentIndex = sortedColumns.findIndex((c) => c.id === currentColumn.id);
      const nextColumn = sortedColumns[currentIndex + 1];

      if (!nextColumn) return; // Already at last column

      task.columnId = nextColumn.id;
      task.status = columnIdToTaskStatus(nextColumn.id);
      // Preserve the current session in history before clearing for next automation
      if (task.triggerSessionId) {
        if (!task.sessionIds) task.sessionIds = [];
        if (!task.sessionIds.includes(task.triggerSessionId)) {
          task.sessionIds.push(task.triggerSessionId);
        }
      }
      task.triggerSessionId = undefined;
      task.updatedAt = new Date();
      await this.taskStore.save(task);

      // Clean up the session queue entry before emitting transition
      // This prevents the queue from blocking the new automation with a stale entry
      this.cleanupCardSession?.(cardId);

      // Emit transition event for the auto-advance (may trigger next column's automation)
      this.eventBus.emit({
        type: AgentEventType.COLUMN_TRANSITION,
        agentId: "kanban-workflow-orchestrator",
        workspaceId: automation.workspaceId,
        data: {
          cardId,
          cardTitle: automation.cardTitle,
          boardId: automation.boardId,
          workspaceId: automation.workspaceId,
          fromColumnId: automation.columnId,
          toColumnId: nextColumn.id,
          fromColumnName: currentColumn.name,
          toColumnName: nextColumn.name,
        },
        timestamp: new Date(),
      });
    } catch (err) {
      console.error("[WorkflowOrchestrator] Auto-advance failed:", err);
    }
  }
}
