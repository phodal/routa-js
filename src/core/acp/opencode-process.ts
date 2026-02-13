/**
 * AcpProcess - Manages an ACP-compliant agent child process
 *
 * Spawns any ACP agent CLI (opencode, gemini, codex-acp, auggie, copilot, etc.)
 * with piped stdio and communicates via JSON-RPC (NDJSON).
 *
 * Handles:
 *   - Sending JSON-RPC requests to the agent (stdin)
 *   - Parsing JSON-RPC responses/notifications from the agent (stdout)
 *   - Forwarding `session/update` notifications to the caller
 *   - Handling agent→client requests (fs, terminal, permissions) with auto-responses
 *
 * Provider selection is driven by AcpAgentPreset configurations.
 * See acp-presets.ts for available presets.
 */

import { spawn, type ChildProcess } from "child_process";
import {
  type AcpAgentPreset,
  getPresetById,
  resolveCommand,
} from "./acp-presets";

export type NotificationHandler = (msg: JsonRpcMessage) => void;

export interface JsonRpcMessage {
  jsonrpc: "2.0";
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

/**
 * Configuration for creating an AcpProcess.
 * Can be created from a preset or custom command.
 */
export interface AcpProcessConfig {
  /** The preset being used (if any) */
  preset?: AcpAgentPreset;
  /** Resolved command to execute */
  command: string;
  /** Command-line arguments (preset args + any additional args like --cwd) */
  args: string[];
  /** Working directory */
  cwd: string;
  /** Additional environment variables */
  env?: Record<string, string>;
  /** Display name for logging */
  displayName: string;
}

/**
 * Build an AcpProcessConfig from a preset ID and working directory.
 */
export function buildConfigFromPreset(
  presetId: string,
  cwd: string,
  extraArgs?: string[],
  extraEnv?: Record<string, string>
): AcpProcessConfig {
  const preset = getPresetById(presetId);
  if (!preset) {
    throw new Error(
      `Unknown ACP preset: "${presetId}". Use one of: opencode, gemini, codex, copilot, auggie, kimi`
    );
  }
  if (preset.nonStandardApi) {
    throw new Error(
      `Preset "${presetId}" uses a non-standard API and is not supported by AcpProcess. ` +
        `It requires a separate implementation.`
    );
  }

  const command = resolveCommand(preset);
  const args = [...preset.args];

  // Append --cwd if the preset uses positional cwd (like opencode)
  // For others, we rely on the process cwd
  if (preset.id === "opencode") {
    args.push("--cwd", cwd);
  }

  if (extraArgs) {
    args.push(...extraArgs);
  }

  return {
    preset,
    command,
    args,
    cwd,
    env: extraEnv,
    displayName: preset.name,
  };
}

/**
 * Build a default config (opencode) for backward compatibility.
 */
export function buildDefaultConfig(cwd: string): AcpProcessConfig {
  return buildConfigFromPreset("opencode", cwd);
}

/**
 * Manages a single ACP agent process and its JSON-RPC communication.
 *
 * This is the core abstraction that handles the ACP protocol over stdio.
 * It works with any ACP-compliant agent (opencode, gemini, codex-acp, etc.).
 */
export class AcpProcess {
  private process: ChildProcess | null = null;
  private buffer = "";
  private pendingRequests = new Map<number | string, PendingRequest>();
  private requestId = 0;
  private onNotification: NotificationHandler;
  private _sessionId: string | null = null;
  private _alive = false;
  private _config: AcpProcessConfig;

  constructor(config: AcpProcessConfig, onNotification: NotificationHandler) {
    this._config = config;
    this.onNotification = onNotification;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get alive(): boolean {
    return this._alive && this.process !== null && this.process.exitCode === null;
  }

  get config(): AcpProcessConfig {
    return this._config;
  }

  get presetId(): string | undefined {
    return this._config.preset?.id;
  }

  /**
   * Spawn the ACP agent process and wait for it to be ready.
   */
  async start(): Promise<void> {
    const { command, args, cwd, env, displayName } = this._config;

    console.log(
      `[AcpProcess:${displayName}] Spawning: ${command} ${args.join(" ")} (cwd: ${cwd})`
    );

    this.process = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      cwd,
      env: {
        ...process.env,
        ...env,
        NODE_NO_READLINE: "1",
      },
      detached: false,
    });

    if (!this.process || !this.process.pid) {
      throw new Error(
        `Failed to spawn ${displayName} - is "${command}" installed and in PATH?`
      );
    }

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error(
        `${displayName} spawned without required stdio streams`
      );
    }

    this._alive = true;

    // Parse stdout as NDJSON
    this.process.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf-8");
      this.processBuffer();
    });

    this.process.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString("utf-8").trim();
      if (text) {
        console.error(`[AcpProcess:${displayName} stderr] ${text}`);
      }
    });

    this.process.on("exit", (code, signal) => {
      console.log(
        `[AcpProcess:${displayName}] Process exited: code=${code}, signal=${signal}`
      );
      this._alive = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`${displayName} process exited (code=${code})`));
        this.pendingRequests.delete(id);
      }
    });

    this.process.on("error", (err) => {
      console.error(`[AcpProcess:${displayName}] Process error:`, err);
      this._alive = false;
    });

    // Wait for process to stabilize
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!this.alive) {
      throw new Error(`${displayName} process died during startup`);
    }

    console.log(
      `[AcpProcess:${displayName}] Process started, pid=${this.process.pid}`
    );
  }

  /**
   * Initialize the ACP protocol.
   */
  async initialize(): Promise<unknown> {
    const result = await this.sendRequest("initialize", {
      protocolVersion: 1,
      clientInfo: {
        name: "routa-js",
        version: "0.1.0",
      },
    });
    console.log(
      `[AcpProcess:${this._config.displayName}] Initialized:`,
      JSON.stringify(result)
    );
    return result;
  }

  /**
   * Create a new ACP session.
   */
  async newSession(cwd?: string): Promise<string> {
    const result = (await this.sendRequest("session/new", {
      cwd: cwd || this._config.cwd,
      mcpServers: [],
    })) as { sessionId: string };

    this._sessionId = result.sessionId;
    console.log(
      `[AcpProcess:${this._config.displayName}] Session created: ${this._sessionId}`
    );
    return this._sessionId;
  }

  /**
   * Send a prompt to the current session.
   * The response comes back asynchronously; content streams via session/update notifications.
   */
  async prompt(
    sessionId: string,
    text: string
  ): Promise<{ stopReason: string }> {
    const result = (await this.sendRequest(
      "session/prompt",
      {
        sessionId,
        prompt: [{ type: "text", text }],
      },
      300000 // 5 min timeout for prompts
    )) as { stopReason: string };
    return result;
  }

  /**
   * Cancel the current prompt.
   */
  async cancel(sessionId: string): Promise<void> {
    // session/cancel is a notification (no response expected)
    this.writeMessage({
      jsonrpc: "2.0",
      method: "session/cancel",
      params: { sessionId },
    });
  }

  /**
   * Send a generic JSON-RPC request and wait for response.
   */
  async sendRequest(
    method: string,
    params: Record<string, unknown>,
    timeoutMs?: number
  ): Promise<unknown> {
    if (!this.alive) {
      throw new Error(`${this._config.displayName} process is not alive`);
    }

    return new Promise((resolve, reject) => {
      const id = ++this.requestId;

      const defaultTimeout =
        method === "initialize" || method === "session/new"
          ? 10000 // 10s for init requests
          : 30000; // 30s for normal requests

      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Timeout waiting for ${method} (id=${id})`));
      }, timeoutMs ?? defaultTimeout);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.writeMessage({
        jsonrpc: "2.0",
        id,
        method,
        params,
      });
    });
  }

  /**
   * Kill the agent process.
   */
  kill(): void {
    if (this.process && this.process.exitCode === null) {
      console.log(
        `[AcpProcess:${this._config.displayName}] Killing process pid=${this.process.pid}`
      );
      this.process.kill("SIGTERM");

      // Force kill after 5 seconds if still alive
      setTimeout(() => {
        if (this.process && this.process.exitCode === null) {
          this.process.kill("SIGKILL");
        }
      }, 5000);
    }
    this._alive = false;
  }

  // ─── Private ────────────────────────────────────────────────────────────

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    // Keep the last incomplete line in the buffer
    this.buffer = lines[lines.length - 1];

    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const msg = JSON.parse(line) as JsonRpcMessage;
        this.handleMessage(msg);
      } catch {
        // Try to find JSON objects in the line (some agents concatenate)
        this.tryParseEmbeddedJson(line);
      }
    }
  }

  private tryParseEmbeddedJson(line: string): void {
    // Try to find JSON objects by matching braces
    let depth = 0;
    let start = -1;

    for (let i = 0; i < line.length; i++) {
      if (line[i] === "{") {
        if (depth === 0) start = i;
        depth++;
      } else if (line[i] === "}") {
        depth--;
        if (depth === 0 && start >= 0) {
          try {
            const msg = JSON.parse(line.slice(start, i + 1)) as JsonRpcMessage;
            this.handleMessage(msg);
          } catch {
            // Ignore parse errors for embedded JSON
          }
          start = -1;
        }
      }
    }
  }

  private handleMessage(msg: JsonRpcMessage): void {
    // Response to a pending request (has id, has result or error)
    if (
      msg.id !== undefined &&
      (msg.result !== undefined || msg.error !== undefined)
    ) {
      const pending = this.pendingRequests.get(msg.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(msg.id);
        if (msg.error) {
          pending.reject(
            new Error(`ACP Error [${msg.error.code}]: ${msg.error.message}`)
          );
        } else {
          pending.resolve(msg.result);
        }
        return;
      }
    }

    // Agent→Client requests (has id and method, expects response)
    if (msg.id !== undefined && msg.method) {
      this.handleAgentRequest(msg);
      return;
    }

    // Notification (no id, has method) - e.g. session/update
    if (msg.method) {
      const updateType = (msg.params as Record<string, unknown>)?.update;
      const sessionUpdate = updateType
        ? (updateType as Record<string, unknown>)?.sessionUpdate
        : (msg.params as Record<string, unknown>)?.sessionUpdate;
      console.log(
        `[AcpProcess:${this._config.displayName}] Notification: ${msg.method} (${sessionUpdate ?? "unknown"})`
      );
      this.onNotification(msg);
      return;
    }

    console.warn(
      `[AcpProcess:${this._config.displayName}] Unhandled message:`,
      JSON.stringify(msg)
    );
  }

  /**
   * Handle requests FROM the agent TO the client (fs, terminal, permissions).
   * We auto-respond to keep the agent running.
   */
  private handleAgentRequest(msg: JsonRpcMessage): void {
    const { method, id, params } = msg;

    console.log(
      `[AcpProcess:${this._config.displayName}] Agent request: ${method} (id=${id})`
    );

    switch (method) {
      case "session/request_permission": {
        // Auto-approve all permissions
        this.writeMessage({
          jsonrpc: "2.0",
          id,
          result: {
            outcome: {
              outcome: "approved",
            },
          },
        });
        break;
      }

      case "fs/read_text_file": {
        const filePath = (params as { path: string })?.path;
        if (filePath) {
          try {
            const fs = require("fs");
            const content = fs.readFileSync(filePath, "utf-8");
            this.writeMessage({
              jsonrpc: "2.0",
              id,
              result: { content },
            });
          } catch (err) {
            this.writeMessage({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32000,
                message: `Failed to read file: ${(err as Error).message}`,
              },
            });
          }
        }
        break;
      }

      case "fs/write_text_file": {
        const { path: writePath, content } = (params as {
          path: string;
          content: string;
        }) ?? {};
        if (writePath && content !== undefined) {
          try {
            const fs = require("fs");
            fs.writeFileSync(writePath, content, "utf-8");
            this.writeMessage({
              jsonrpc: "2.0",
              id,
              result: {},
            });
          } catch (err) {
            this.writeMessage({
              jsonrpc: "2.0",
              id,
              error: {
                code: -32000,
                message: `Failed to write file: ${(err as Error).message}`,
              },
            });
          }
        }
        break;
      }

      case "terminal/create":
      case "terminal/output":
      case "terminal/release":
      case "terminal/wait_for_exit":
      case "terminal/kill": {
        // Stub terminal operations - return empty success
        this.writeMessage({
          jsonrpc: "2.0",
          id,
          result: {},
        });
        break;
      }

      default: {
        console.warn(
          `[AcpProcess:${this._config.displayName}] Unknown agent request: ${method}`
        );
        this.writeMessage({
          jsonrpc: "2.0",
          id,
          error: {
            code: -32601,
            message: `Method not supported: ${method}`,
          },
        });
      }
    }
  }

  private writeMessage(msg: Record<string, unknown>): void {
    if (!this.process?.stdin?.writable) {
      console.error(
        `[AcpProcess:${this._config.displayName}] Cannot write - stdin not writable`
      );
      return;
    }

    const data = JSON.stringify(msg) + "\n";
    this.process.stdin.write(data);
  }
}

// ─── Backward-compatible alias ─────────────────────────────────────────

/**
 * @deprecated Use `AcpProcess` instead. This alias exists for backward compatibility.
 */
export const OpenCodeProcess = AcpProcess;

// ─── Process Manager (manages multiple ACP agent processes) ────────────

interface ManagedProcess {
  process: AcpProcess;
  acpSessionId: string; // Session ID from the agent
  presetId: string; // Which preset was used
  createdAt: Date;
}

/**
 * Singleton manager for ACP agent processes.
 * Maps our session IDs to ACP process instances.
 * Supports spawning different agent types via presets.
 */
class AcpProcessManager {
  private processes = new Map<string, ManagedProcess>();

  /**
   * Spawn a new ACP agent process, initialize the protocol, and create a session.
   *
   * @param sessionId - Our internal session ID
   * @param cwd - Working directory for the agent
   * @param onNotification - Handler for session/update notifications
   * @param presetId - Which ACP agent to use (default: "opencode")
   * @param extraArgs - Additional command-line arguments
   * @param extraEnv - Additional environment variables
   * @returns The agent's ACP session ID
   */
  async createSession(
    sessionId: string,
    cwd: string,
    onNotification: NotificationHandler,
    presetId: string = "opencode",
    extraArgs?: string[],
    extraEnv?: Record<string, string>
  ): Promise<string> {
    const config = buildConfigFromPreset(presetId, cwd, extraArgs, extraEnv);
    const proc = new AcpProcess(config, onNotification);

    await proc.start();
    await proc.initialize();
    const acpSessionId = await proc.newSession(cwd);

    this.processes.set(sessionId, {
      process: proc,
      acpSessionId,
      presetId,
      createdAt: new Date(),
    });

    return acpSessionId;
  }

  /**
   * Get the ACP process for a session.
   */
  getProcess(sessionId: string): AcpProcess | undefined {
    return this.processes.get(sessionId)?.process;
  }

  /**
   * Get the agent's ACP session ID for our session.
   */
  getAcpSessionId(sessionId: string): string | undefined {
    return this.processes.get(sessionId)?.acpSessionId;
  }

  /**
   * Get the preset ID used for a session.
   */
  getPresetId(sessionId: string): string | undefined {
    return this.processes.get(sessionId)?.presetId;
  }

  /**
   * List all active sessions.
   */
  listSessions(): Array<{
    sessionId: string;
    acpSessionId: string;
    presetId: string;
    alive: boolean;
    createdAt: Date;
  }> {
    return Array.from(this.processes.entries()).map(([sessionId, managed]) => ({
      sessionId,
      acpSessionId: managed.acpSessionId,
      presetId: managed.presetId,
      alive: managed.process.alive,
      createdAt: managed.createdAt,
    }));
  }

  /**
   * Kill a session's agent process.
   */
  killSession(sessionId: string): void {
    const managed = this.processes.get(sessionId);
    if (managed) {
      managed.process.kill();
      this.processes.delete(sessionId);
    }
  }

  /**
   * Kill all processes.
   */
  killAll(): void {
    for (const [, managed] of this.processes) {
      managed.process.kill();
    }
    this.processes.clear();
  }
}

// ─── Backward-compatible alias ─────────────────────────────────────────

/**
 * @deprecated Use `AcpProcessManager` (via `getAcpProcessManager()`) instead.
 */
const OpenCodeProcessManager = AcpProcessManager;

// Singleton
let singleton: AcpProcessManager | undefined;

/**
 * Get the singleton AcpProcessManager instance.
 */
export function getAcpProcessManager(): AcpProcessManager {
  if (!singleton) {
    singleton = new AcpProcessManager();
  }
  return singleton;
}

/**
 * @deprecated Use `getAcpProcessManager()` instead. This alias exists for backward compatibility.
 */
export const getOpenCodeProcessManager = getAcpProcessManager;
