/**
 * TypeScript types for workflow definitions.
 * Based on Rust schema in crates/routa-core/src/workflow/schema.rs
 */

/** Top-level workflow definition loaded from a YAML file. */
export interface WorkflowDefinition {
  /** Workflow name */
  name: string;
  /** Optional description */
  description?: string;
  /** Version string */
  version?: string;
  /** How the workflow is triggered */
  trigger?: TriggerConfig;
  /** Variable substitution map (supports `${ENV_VAR}` references) */
  variables?: Record<string, string>;
  /** Ordered list of workflow steps */
  steps: WorkflowStep[];
}

/** Trigger configuration — how/when the workflow runs. */
export interface TriggerConfig {
  /** Trigger type: "manual", "webhook", "schedule" */
  type: "manual" | "webhook" | "schedule";
  /** For webhook triggers: the event source (e.g., "github") */
  source?: string;
  /** For webhook triggers: the event name (e.g., "pull_request.opened") */
  event?: string;
  /** For schedule triggers: cron expression */
  cron?: string;
}

/** What to do when a step fails. */
export type OnFailure = "stop" | "continue" | "retry";

/** A single step in the workflow pipeline. */
export interface WorkflowStep {
  /** Step name (unique within the workflow, used for output references) */
  name: string;
  /** Specialist ID — references a specialist YAML file or built-in specialist */
  specialist: string;
  /** Adapter type: "claude-code-sdk", "opencode-sdk", "acp" */
  adapter?: string;
  /** Adapter-specific configuration */
  config?: StepConfig;
  /** Input template — supports variable substitution */
  input?: string;
  /** List of actions/capabilities for the agent to perform */
  actions?: (string | { name: string; params?: Record<string, unknown> })[];
  /** Key to store this step's output under (for downstream reference) */
  output_key?: string;
  /** Condition: only run this step if the expression evaluates to true */
  if?: string;
  /** Parallel group: steps in the same group run concurrently */
  parallel_group?: string;
  /** What to do if this step fails */
  on_failure?: OnFailure;
  /** Maximum retries (only used when on_failure = retry) */
  max_retries?: number;
  /** Timeout in seconds for this step (default: 300) */
  timeout_secs?: number;
}

/** Configuration for a workflow step's adapter. */
export interface StepConfig {
  /** Model to use */
  model?: string;
  /** Maximum conversation turns */
  max_turns?: number;
  /** Maximum tokens for response */
  max_tokens?: number;
  /** Base URL for the API endpoint */
  base_url?: string;
  /** API key override (supports `${ENV_VAR}` references) */
  api_key?: string;
  /** Temperature for generation */
  temperature?: number;
  /** System prompt override */
  system_prompt?: string;
  /** Working directory for the agent */
  cwd?: string;
  /** Additional environment variables */
  env?: Record<string, string>;
}

// ─── WorkflowRun Runtime State ─────────────────────────────────────────────

/** Status of a workflow run. */
export type WorkflowRunStatus = "PENDING" | "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED";

/** Runtime state of a workflow execution. */
export interface WorkflowRun {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion?: string;
  workspaceId: string;
  /** Current execution status */
  status: WorkflowRunStatus;
  /** Name of the currently executing step */
  currentStepName?: string;
  /** The original trigger payload (e.g., webhook body) */
  triggerPayload?: string;
  /** Source of the trigger */
  triggerSource: "manual" | "webhook" | "schedule";
  /** Step outputs keyed by step name or output_key */
  stepOutputs?: Record<string, string>;
  /** Error message if failed */
  errorMessage?: string;
  /** Total steps in the workflow */
  totalSteps: number;
  /** Completed steps count */
  completedSteps: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

/** Input for creating a new workflow run. */
export interface CreateWorkflowRunInput {
  workflowId: string;
  workflowName: string;
  workflowVersion?: string;
  workspaceId: string;
  triggerPayload?: string;
  triggerSource: "manual" | "webhook" | "schedule";
  totalSteps: number;
}

