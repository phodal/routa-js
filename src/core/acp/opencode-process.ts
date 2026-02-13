/**
 * OpenCodeProcess - Manages an opencode ACP child process
 *
 * Spawns `opencode acp` with piped stdio and communicates via JSON-RPC (NDJSON).
 * Handles:
 *   - Sending JSON-RPC requests to opencode (stdin)
 *   - Parsing JSON-RPC responses/notifications from opencode (stdout)
 *   - Forwarding `session/update` notifications to the caller
 *   - Handling agent→client requests (fs, terminal, permissions) with auto-responses
 */

import { spawn, type ChildProcess } from "child_process";

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
 * Manages a single opencode ACP process and its JSON-RPC communication.
 */
export class OpenCodeProcess {
  private process: ChildProcess | null = null;
  private buffer = "";
  private pendingRequests = new Map<number | string, PendingRequest>();
  private requestId = 0;
  private onNotification: NotificationHandler;
  private _sessionId: string | null = null;
  private _alive = false;
  private _cwd: string;

  constructor(cwd: string, onNotification: NotificationHandler) {
    this._cwd = cwd;
    this.onNotification = onNotification;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  get alive(): boolean {
    return this._alive && this.process !== null && this.process.exitCode === null;
  }

  /**
   * Spawn the opencode acp process and wait for it to be ready.
   */
  async start(): Promise<void> {
    const opencodeBin = process.env.OPENCODE_BIN || "opencode";

    console.log(`[OpenCodeProcess] Spawning: ${opencodeBin} acp --cwd ${this._cwd}`);

    this.process = spawn(opencodeBin, ["acp", "--cwd", this._cwd], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: this._cwd,
      env: {
        ...process.env,
        NODE_NO_READLINE: "1",
      },
      detached: false,
    });

    if (!this.process || !this.process.pid) {
      throw new Error(
        `Failed to spawn opencode acp - is opencode installed?`
      );
    }

    if (!this.process.stdin || !this.process.stdout) {
      throw new Error(
        `opencode spawned without required stdio streams`
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
        console.error(`[OpenCodeProcess stderr] ${text}`);
      }
    });

    this.process.on("exit", (code, signal) => {
      console.log(
        `[OpenCodeProcess] Process exited: code=${code}, signal=${signal}`
      );
      this._alive = false;
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error(`opencode process exited (code=${code})`));
        this.pendingRequests.delete(id);
      }
    });

    this.process.on("error", (err) => {
      console.error(`[OpenCodeProcess] Process error:`, err);
      this._alive = false;
    });

    // Wait for process to stabilize
    await new Promise((resolve) => setTimeout(resolve, 500));

    if (!this.alive) {
      throw new Error("opencode process died during startup");
    }

    console.log(`[OpenCodeProcess] Process started, pid=${this.process.pid}`);
  }

  /**
   * Initialize the ACP protocol with opencode.
   */
  async initialize(): Promise<unknown> {
    const result = await this.sendRequest("initialize", {
      protocolVersion: 1,
      clientInfo: {
        name: "routa-js",
        version: "0.1.0",
      },
    });
    console.log(`[OpenCodeProcess] Initialized:`, JSON.stringify(result));
    return result;
  }

  /**
   * Create a new ACP session.
   */
  async newSession(cwd?: string): Promise<string> {
    const result = (await this.sendRequest("session/new", {
      cwd: cwd || this._cwd,
      mcpServers: [],
    })) as { sessionId: string };

    this._sessionId = result.sessionId;
    console.log(`[OpenCodeProcess] Session created: ${this._sessionId}`);
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
      throw new Error("opencode process is not alive");
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
   * Kill the opencode process.
   */
  kill(): void {
    if (this.process && this.process.exitCode === null) {
      console.log(`[OpenCodeProcess] Killing process pid=${this.process.pid}`);
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
        `[OpenCodeProcess] Notification: ${msg.method} (${sessionUpdate ?? "unknown"})`
      );
      this.onNotification(msg);
      return;
    }

    console.warn("[OpenCodeProcess] Unhandled message:", JSON.stringify(msg));
  }

  /**
   * Handle requests FROM the agent TO the client (fs, terminal, permissions).
   * We auto-respond to keep the agent running.
   */
  private handleAgentRequest(msg: JsonRpcMessage): void {
    const { method, id, params } = msg;

    console.log(`[OpenCodeProcess] Agent request: ${method} (id=${id})`);

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
          `[OpenCodeProcess] Unknown agent request: ${method}`
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
      console.error("[OpenCodeProcess] Cannot write - stdin not writable");
      return;
    }

    const data = JSON.stringify(msg) + "\n";
    this.process.stdin.write(data);
  }
}

// ─── Process Manager (manages multiple OpenCode processes) ──────────────

interface ManagedProcess {
  process: OpenCodeProcess;
  acpSessionId: string; // Session ID from opencode
  createdAt: Date;
}

/**
 * Singleton manager for OpenCode processes.
 * Maps our session IDs to OpenCode process instances.
 */
class OpenCodeProcessManager {
  private processes = new Map<string, ManagedProcess>();

  /**
   * Spawn a new opencode process, initialize ACP, and create a session.
   * Returns the opencode session ID.
   */
  async createSession(
    sessionId: string,
    cwd: string,
    onNotification: NotificationHandler
  ): Promise<string> {
    const proc = new OpenCodeProcess(cwd, onNotification);

    await proc.start();
    await proc.initialize();
    const acpSessionId = await proc.newSession(cwd);

    this.processes.set(sessionId, {
      process: proc,
      acpSessionId,
      createdAt: new Date(),
    });

    return acpSessionId;
  }

  /**
   * Get the OpenCode process for a session.
   */
  getProcess(sessionId: string): OpenCodeProcess | undefined {
    return this.processes.get(sessionId)?.process;
  }

  /**
   * Get the opencode ACP session ID for our session.
   */
  getAcpSessionId(sessionId: string): string | undefined {
    return this.processes.get(sessionId)?.acpSessionId;
  }

  /**
   * List all active sessions.
   */
  listSessions(): Array<{
    sessionId: string;
    acpSessionId: string;
    alive: boolean;
    createdAt: Date;
  }> {
    return Array.from(this.processes.entries()).map(([sessionId, managed]) => ({
      sessionId,
      acpSessionId: managed.acpSessionId,
      alive: managed.process.alive,
      createdAt: managed.createdAt,
    }));
  }

  /**
   * Kill a session's opencode process.
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
    for (const [sessionId, managed] of this.processes) {
      managed.process.kill();
    }
    this.processes.clear();
  }
}

// Singleton
let singleton: OpenCodeProcessManager | undefined;

export function getOpenCodeProcessManager(): OpenCodeProcessManager {
  if (!singleton) {
    singleton = new OpenCodeProcessManager();
  }
  return singleton;
}
