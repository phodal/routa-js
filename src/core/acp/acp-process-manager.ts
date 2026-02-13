import {AcpProcess} from "@/core/acp/acp-process";
import {buildConfigFromPreset, ManagedProcess, NotificationHandler} from "@/core/acp/processer";

/**
 * Singleton manager for ACP agent processes.
 * Maps our session IDs to ACP process instances.
 * Supports spawning different agent types via presets.
 */
export class AcpProcessManager {
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