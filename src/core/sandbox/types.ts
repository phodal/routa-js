/**
 * Sandbox type definitions for code execution sandboxes.
 *
 * Mirrors the Rust types in crates/routa-core/src/sandbox/types.rs
 * Reference: https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
 */

export const SANDBOX_LABEL = "routa.sandbox";
export const SANDBOX_IMAGE = "routa/sandbox:latest";
export const SANDBOX_CONTAINER_PORT = 8000;
export const SANDBOX_IDLE_TIMEOUT_MS = 60_000;
export const SANDBOX_CHECK_INTERVAL_MS = 60_000;

/** Information about a running sandbox container. */
export interface SandboxInfo {
  /** Docker container ID. */
  id: string;
  /** Docker container name. */
  name: string;
  /** Container status (e.g. "running"). */
  status: string;
  /** Programming language for the sandbox kernel (e.g. "python"). */
  lang: string;
  /** Host port mapped to the in-sandbox server. */
  port?: number;
  /** ISO timestamp when the sandbox was created. */
  createdAt: string;
  /** ISO timestamp when the sandbox was last active. */
  lastActiveAt: string;
}

/** Request body for creating a new sandbox. */
export interface CreateSandboxRequest {
  /** Language for the sandbox kernel. Currently only "python" is supported. */
  lang: string;
}

/** Request body for executing code in a sandbox. */
export interface ExecuteRequest {
  /** The source code to execute. */
  code: string;
}

/**
 * A single streaming output event from code execution (NDJSON).
 *
 * Exactly one of `text`, `image`, or `error` will be present.
 */
export type SandboxOutputEvent =
  | { text: string }
  | { image: string }
  | { error: string };
