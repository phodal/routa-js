import { getAcpProcessManager } from "@/core/acp/processer";
import { getHttpSessionStore, type SessionUpdateNotification } from "@/core/acp/http-session-store";
import type { DispatchSharedPromptInput, SharedPromptDispatcher } from "./types";

function createSessionUpdateForwarder(
  store: ReturnType<typeof getHttpSessionStore>,
  sessionId: string,
) {
  return (msg: { method?: string; params?: Record<string, unknown> }) => {
    if (msg.method !== "session/update" || !msg.params) return;

    const params = msg.params as Record<string, unknown>;
    const notification = {
      ...params,
      sessionId,
    } as SessionUpdateNotification;

    store.pushNotification(notification);
  };
}

export const dispatchPromptToHostSession: SharedPromptDispatcher = async (
  input: DispatchSharedPromptInput
) => {
  const manager = getAcpProcessManager();
  const store = getHttpSessionStore();
  const { hostSessionId, prompt } = input;

  const sessionRecord = store.getSession(hostSessionId);
  if (!sessionRecord) {
    throw new Error(`Host session not found: ${hostSessionId}`);
  }

  const forwardSessionUpdate = createSessionUpdateForwarder(store, hostSessionId);
  store.pushUserMessage(hostSessionId, prompt);

  if (
    manager.isOpencodeAdapterSession(hostSessionId)
    || await manager.isOpencodeSdkSessionAsync(hostSessionId)
  ) {
    const adapter = await manager.getOrRecreateOpencodeSdkAdapter(hostSessionId, forwardSessionUpdate);
    if (!adapter || !adapter.alive) {
      throw new Error(`OpenCode SDK session unavailable: ${hostSessionId}`);
    }
    await adapter.prompt(prompt);
    store.flushAgentBuffer(hostSessionId);
    return;
  }

  if (manager.isDockerAdapterSession(hostSessionId)) {
    const dockerAdapter = manager.getDockerAdapter(hostSessionId);
    if (!dockerAdapter || !dockerAdapter.alive) {
      throw new Error(`Docker OpenCode session unavailable: ${hostSessionId}`);
    }
    for await (const _event of dockerAdapter.promptStream(
      prompt,
      hostSessionId,
      undefined,
      sessionRecord.workspaceId,
    )) {
      // Drain stream to completion so notifications are fully emitted.
    }
    store.flushAgentBuffer(hostSessionId);
    return;
  }

  if (await manager.isClaudeCodeSdkSessionAsync(hostSessionId)) {
    const adapter = await manager.getOrRecreateClaudeCodeSdkAdapter(hostSessionId, forwardSessionUpdate);
    if (!adapter || !adapter.alive) {
      throw new Error(`Claude Code SDK session unavailable: ${hostSessionId}`);
    }
    await adapter.prompt(prompt);
    store.flushAgentBuffer(hostSessionId);
    return;
  }

  if (manager.isClaudeSession(hostSessionId)) {
    const claudeProc = manager.getClaudeProcess(hostSessionId);
    if (!claudeProc || !claudeProc.alive) {
      throw new Error(`Claude process unavailable: ${hostSessionId}`);
    }
    await claudeProc.prompt(hostSessionId, prompt);
    store.flushAgentBuffer(hostSessionId);
    return;
  }

  const proc = manager.getProcess(hostSessionId);
  const acpSessionId = manager.getAcpSessionId(hostSessionId);
  if (!proc || !acpSessionId || !proc.alive) {
    throw new Error(`ACP process unavailable for host session: ${hostSessionId}`);
  }

  await proc.prompt(acpSessionId, prompt);
  store.flushAgentBuffer(hostSessionId);
};

