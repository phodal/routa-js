/**
 * SandboxManager — manages Docker-based code execution sandboxes.
 *
 * Mirrors the Rust SandboxManager in crates/routa-core/src/sandbox/manager.rs
 * Reference: https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
 */

import { exec } from "child_process";
import { promisify } from "util";
import { v4 as uuidv4 } from "uuid";
import {
  SANDBOX_CHECK_INTERVAL_MS,
  SANDBOX_CONTAINER_PORT,
  SANDBOX_IDLE_TIMEOUT_MS,
  SANDBOX_IMAGE,
  SANDBOX_LABEL,
  type CreateSandboxRequest,
  type ExecuteRequest,
  type SandboxInfo,
} from "./types";
import { findAvailablePort } from "@/core/acp/docker/utils";

const execAsync = promisify(exec);

/** Singleton SandboxManager. */
export class SandboxManager {
  private static instance: SandboxManager | null = null;

  private sandboxes = new Map<string, SandboxInfo>();
  private lastActive = new Map<string, number>();
  private usedPorts = new Set<number>();
  private idleCheckTimer: ReturnType<typeof setInterval> | null = null;

  private constructor() {
    this.startIdleCleanup();
  }

  static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager();
    }
    return SandboxManager.instance;
  }

  // ── Idle cleanup ────────────────────────────────────────────────────────────

  private startIdleCleanup(): void {
    this.idleCheckTimer = setInterval(async () => {
      const now = Date.now();
      for (const [id, lastTime] of this.lastActive.entries()) {
        if (now - lastTime > SANDBOX_IDLE_TIMEOUT_MS) {
          console.log(`[SandboxManager] Terminating idle sandbox ${id.slice(0, 8)}`);
          await this.stopContainer(id).catch(() => {});
          const info = this.sandboxes.get(id);
          if (info?.port) this.usedPorts.delete(info.port);
          this.sandboxes.delete(id);
          this.lastActive.delete(id);
        }
      }
    }, SANDBOX_CHECK_INTERVAL_MS);

    // Don't keep the process alive just for cleanup.
    if (this.idleCheckTimer.unref) this.idleCheckTimer.unref();
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** List all tracked sandbox containers. */
  listSandboxes(): SandboxInfo[] {
    return Array.from(this.sandboxes.values());
  }

  /** Get a sandbox by container ID (or unique prefix). */
  getSandbox(id: string): SandboxInfo | undefined {
    if (this.sandboxes.has(id)) return this.sandboxes.get(id);
    // Support short/prefix IDs.
    for (const [key, info] of this.sandboxes.entries()) {
      if (key.startsWith(id)) return info;
    }
    return undefined;
  }

  /** Create a new sandbox Docker container. */
  async createSandbox(req: CreateSandboxRequest): Promise<SandboxInfo> {
    const lang = req.lang.toLowerCase();
    if (lang !== "python") {
      throw new Error("Only Python sandboxes are supported.");
    }

    const hostPort = await findAvailablePort(this.usedPorts);
    this.usedPorts.add(hostPort);

    const shortId = uuidv4().slice(0, 8);
    const containerName = `routa-sandbox-${shortId}`;

    const cmd = [
      "docker run -d --rm",
      `--name=${containerName}`,
      `-p=${hostPort}:${SANDBOX_CONTAINER_PORT}`,
      `--label=${SANDBOX_LABEL}=1`,
      `--label=${SANDBOX_LABEL}.lang=${lang}`,
      "--memory=512m",
      "--cpus=1",
      "--pids-limit=64",
      "--network=bridge",
      SANDBOX_IMAGE,
    ].join(" ");

    let containerId: string;
    try {
      const { stdout } = await execAsync(cmd);
      containerId = stdout.trim();
    } catch (err) {
      this.usedPorts.delete(hostPort);
      throw new Error(`docker run failed: ${err instanceof Error ? err.message : String(err)}`, { cause: err });
    }

    const now = new Date().toISOString();
    const info: SandboxInfo = {
      id: containerId,
      name: containerName,
      status: "running",
      lang,
      port: hostPort,
      createdAt: now,
      lastActiveAt: now,
    };

    this.sandboxes.set(containerId, info);
    this.lastActive.set(containerId, Date.now());

    return info;
  }

  /**
   * Execute code inside a sandbox and return a Node.js `Response` (Web Streams)
   * that streams NDJSON output events from the in-sandbox server.
   */
  async executeInSandbox(id: string, req: ExecuteRequest): Promise<Response> {
    if (!req.code.trim()) {
      throw new Error("Code cannot be empty.");
    }

    const info = this.getSandbox(id);
    if (!info) throw new Error(`Sandbox not found: ${id}`);
    if (!info.port) throw new Error("Sandbox has no exposed port.");

    const sandboxUrl = `http://127.0.0.1:${info.port}/execute`;

    const response = await fetch(sandboxUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
    });

    if (!response.ok) {
      throw new Error(`Sandbox execution failed with status ${response.status}`);
    }

    // Update last active timestamp.
    this.lastActive.set(info.id, Date.now());

    return response;
  }

  /** Stop and remove a sandbox container. */
  async deleteSandbox(id: string): Promise<void> {
    const info = this.getSandbox(id);
    if (!info) throw new Error(`Sandbox not found: ${id}`);

    await this.stopContainer(info.id);

    if (info.port) this.usedPorts.delete(info.port);
    this.sandboxes.delete(info.id);
    this.lastActive.delete(info.id);
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private async stopContainer(containerId: string): Promise<void> {
    await execAsync(`docker stop ${containerId}`).catch(() => {});
    await execAsync(`docker rm -f ${containerId}`).catch(() => {});
  }
}
