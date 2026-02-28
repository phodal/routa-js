/**
 * Workspace Agent State Machine
 *
 * Simplified V1 lifecycle: INIT → ACTING → DONE | FAILED
 * Primary purpose: enforce step count and timeout limits.
 * The LLM's tool-use loop handles plan/act/observe implicitly.
 */

export type AgentState = "INIT" | "ACTING" | "DONE" | "FAILED";

export interface AgentStateContext {
  state: AgentState;
  stepCount: number;
  startedAt: Date;
  lastStepAt: Date | null;
}

export class WorkspaceAgentStateMachine {
  private ctx: AgentStateContext;
  private readonly maxSteps: number;
  private readonly totalTimeoutMs: number;

  constructor(maxSteps: number, totalTimeoutMs: number) {
    this.maxSteps = maxSteps;
    this.totalTimeoutMs = totalTimeoutMs;
    this.ctx = {
      state: "INIT",
      stepCount: 0,
      startedAt: new Date(),
      lastStepAt: null,
    };
  }

  get current(): AgentState {
    return this.ctx.state;
  }

  get context(): Readonly<AgentStateContext> {
    return this.ctx;
  }

  transition(to: AgentState): void {
    this.ctx.state = to;
  }

  incrementStep(): void {
    this.ctx.stepCount++;
    this.ctx.lastStepAt = new Date();
  }

  /**
   * Check if step count or total timeout has been exceeded.
   * Returns an error message if limits are exceeded, null if OK.
   */
  checkLimits(): string | null {
    if (this.ctx.stepCount >= this.maxSteps) {
      return `Max steps exceeded (${this.maxSteps})`;
    }
    const elapsed = Date.now() - this.ctx.startedAt.getTime();
    if (elapsed > this.totalTimeoutMs) {
      return `Total timeout exceeded (${this.totalTimeoutMs}ms)`;
    }
    return null;
  }
}
