import { getServerBridge } from "@/core/platform";
import type { NotificationHandler } from "@/core/acp/processer";
import os from "os";
import path from "path";
import fsSync from "fs";
import {
  DEFAULT_DOCKER_AGENT_IMAGE,
  findAvailablePort,
  generateContainerName,
  sanitizeEnvForLogging,
  shellEscape,
} from "./utils";
import type { DockerContainerConfig, DockerContainerInfo } from "./types";

const DEFAULT_CONTAINER_PORT = 4321;
const DEFAULT_HEALTH_TIMEOUT_MS = 30_000;

export class DockerProcessManager {
  private static instance: DockerProcessManager | null = null;
  private containers = new Map<string, DockerContainerInfo>();
  private usedPorts = new Set<number>();

  static getInstance(): DockerProcessManager {
    if (!DockerProcessManager.instance) {
      DockerProcessManager.instance = new DockerProcessManager();
    }
    return DockerProcessManager.instance;
  }

  listContainers(): DockerContainerInfo[] {
    return Array.from(this.containers.values());
  }

  getContainer(sessionId: string): DockerContainerInfo | undefined {
    return this.containers.get(sessionId);
  }

  async startContainer(config: DockerContainerConfig): Promise<DockerContainerInfo> {
    const bridge = getServerBridge();
    const containerPort = config.containerPort ?? DEFAULT_CONTAINER_PORT;
    const hostPort = await findAvailablePort(this.usedPorts);
    const containerName = generateContainerName(config.sessionId);

    const labels = {
      "routa.managed": "true",
      "routa.session": config.sessionId,
      ...(config.labels ?? {}),
    };

    const envEntries = Object.entries(config.env ?? {}).filter(([, value]) => typeof value === "string") as Array<[string, string]>;
    const sanitizedEnv = sanitizeEnvForLogging(config.env);

    const runParts: string[] = [
      "docker run -d",
      "--rm",
      `--name ${shellEscape(containerName)}`,
      `-p ${hostPort}:${containerPort}`,
      // Allow the container to reach the host machine (e.g. for MCP at localhost:PORT).
      // On Docker Desktop (Mac/Windows) this resolves automatically; on Linux we
      // need to explicitly map the host-gateway alias.
      "--add-host=host.docker.internal:host-gateway",
      "-w /workspace",
      `-v ${shellEscape(`${config.workspacePath}:/workspace`)}`,
    ];

    // Mount host SSH keys so git SSH operations (clone, push, pull) work inside
    // the container. Mounted read-only to avoid accidental modification.
    const sshDir = path.join(os.homedir(), ".ssh");
    if (fsSync.existsSync(sshDir)) {
      runParts.push(`-v ${shellEscape(`${sshDir}:/root/.ssh:ro`)}`);
    }

    // Mount host git config so commits carry the correct author identity and
    // credential helpers are available for HTTPS operations.
    const gitConfigFile = path.join(os.homedir(), ".gitconfig");
    if (fsSync.existsSync(gitConfigFile)) {
      runParts.push(`-v ${shellEscape(`${gitConfigFile}:/root/.gitconfig:ro`)}`);
    }

    // Derive the Routa MCP URL that is reachable from inside the container.
    // host.docker.internal resolves to the host machine; PORT is the Next.js port.
    const routaPort = process.env.PORT || "3000";
    const routaMcpUrl = `http://host.docker.internal:${routaPort}/api/mcp`;
    runParts.push(`-e ${shellEscape(`ROUTA_MCP_URL=${routaMcpUrl}`)}`);

    // Forward GitHub token for HTTPS git authentication when available.
    if (process.env.GITHUB_TOKEN) {
      runParts.push(`-e GITHUB_TOKEN=${shellEscape(process.env.GITHUB_TOKEN)}`);
    }

    for (const [key, value] of Object.entries(labels)) {
      runParts.push(`--label ${shellEscape(`${key}=${value}`)}`);
    }

    for (const volume of config.additionalVolumes ?? []) {
      runParts.push(`-v ${shellEscape(`${volume.hostPath}:${volume.containerPath}`)}`);
    }

    for (const [key, value] of envEntries) {
      runParts.push(`-e ${shellEscape(`${key}=${value}`)}`);
    }

    runParts.push(shellEscape(config.image || DEFAULT_DOCKER_AGENT_IMAGE));

    const runCommand = runParts.join(" ");

    try {
      const { stdout } = await bridge.process.exec(runCommand, { timeout: 30_000 });
      const containerId = stdout.trim();

      const info: DockerContainerInfo = {
        sessionId: config.sessionId,
        containerId,
        containerName,
        hostPort,
        containerPort,
        image: config.image || DEFAULT_DOCKER_AGENT_IMAGE,
        workspacePath: config.workspacePath,
        createdAt: new Date(),
      };

      this.containers.set(config.sessionId, info);
      this.usedPorts.add(hostPort);

      console.log(
        `[DockerProcessManager] Started container ${containerName} on port ${hostPort} ` +
        `(image: ${info.image}, env: ${JSON.stringify(sanitizedEnv)})`
      );

      return info;
    } catch (err) {
      throw new Error(`Failed to start Docker container: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async waitForHealthy(
    sessionId: string,
    timeoutMs = DEFAULT_HEALTH_TIMEOUT_MS,
    onProgress?: NotificationHandler,
  ): Promise<void> {
    const info = this.containers.get(sessionId);
    if (!info) {
      throw new Error(`No managed Docker container for session ${sessionId}`);
    }

    const emitLog = (text: string) => {
      if (!onProgress) return;
      onProgress({
        jsonrpc: "2.0",
        method: "session/update",
        params: {
          sessionId,
          update: {
            sessionUpdate: "process_output",
            source: "docker",
            data: text,
            displayName: "Docker",
          },
        },
      });
    };

    const start = Date.now();
    const healthUrl = `http://127.0.0.1:${info.hostPort}/health`;
    let lastTickSec = -1;

    emitLog(`Starting container ${info.containerName} on port ${info.hostPort}...\r\n`);

    while (Date.now() - start < timeoutMs) {
      try {
        const res = await fetch(healthUrl, { cache: "no-store" });
        if (res.ok) {
          emitLog(`Container is healthy ✓\r\n`);
          return;
        }
      } catch {
        // Ignore transient startup failures while container is booting.
      }

      const elapsed = Math.floor((Date.now() - start) / 1000);
      if (elapsed !== lastTickSec && elapsed % 3 === 0) {
        lastTickSec = elapsed;
        // Stream recent container logs every 3 seconds
        try {
          const bridge = getServerBridge();
          const { stdout, stderr } = await bridge.process.exec(
            `docker logs --tail 10 ${shellEscape(info.containerName)}`,
            { timeout: 3_000 },
          );
          const combined = (stdout + stderr).trim();
          if (combined) {
            emitLog(combined + "\r\n");
          } else {
            emitLog(`Waiting for container health check... (${elapsed}s)\r\n`);
          }
        } catch {
          emitLog(`Waiting for container health check... (${elapsed}s)\r\n`);
        }
      }

      await new Promise((resolve) => setTimeout(resolve, 1_000));
    }

    const logs = await this.getContainerLogs(info.containerName);
    throw new Error(
      `Docker container health check timeout after ${timeoutMs}ms for ${info.containerName}. ` +
      `Health endpoint: ${healthUrl}. Logs:\n${logs}`
    );
  }

  async stopContainer(sessionId: string): Promise<void> {
    const info = this.containers.get(sessionId);
    if (!info) return;

    const bridge = getServerBridge();

    try {
      await bridge.process.exec(`docker stop -t 10 ${shellEscape(info.containerName)}`, { timeout: 15_000 });
    } catch {
      try {
        await bridge.process.exec(`docker kill ${shellEscape(info.containerName)}`, { timeout: 8_000 });
      } catch {
        // Ignore kill failure; rm -f below is best effort.
      }
    }

    try {
      await bridge.process.exec(`docker rm -f ${shellEscape(info.containerName)}`, { timeout: 8_000 });
    } catch {
      // Ignore cleanup failure for already-removed containers.
    }

    this.containers.delete(sessionId);
    this.usedPorts.delete(info.hostPort);
  }

  async stopAll(): Promise<void> {
    const ids = Array.from(this.containers.keys());
    for (const sessionId of ids) {
      await this.stopContainer(sessionId);
    }
    this.containers.clear();
    this.usedPorts.clear();
  }

  private async getContainerLogs(containerName: string): Promise<string> {
    const bridge = getServerBridge();
    try {
      const { stdout, stderr } = await bridge.process.exec(
        `docker logs --tail 200 ${shellEscape(containerName)}`,
        { timeout: 5_000 },
      );
      return `${stdout}${stderr ? `\n${stderr}` : ""}`.trim();
    } catch (err) {
      return `Failed to read logs: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
}

export function getDockerProcessManager(): DockerProcessManager {
  return DockerProcessManager.getInstance();
}
