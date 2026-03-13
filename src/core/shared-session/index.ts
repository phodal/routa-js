import { getHttpSessionStore } from "@/core/acp/http-session-store";
import { getSharedSessionEventBroadcaster } from "./event-broadcaster";
import { dispatchPromptToHostSession } from "./prompt-dispatcher";
import { SharedSessionService } from "./service";

const GLOBAL_KEY = "__shared_session_service__";

export function getSharedSessionService(): SharedSessionService {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    const sessionHub = getHttpSessionStore();
    const broadcaster = getSharedSessionEventBroadcaster();
    g[GLOBAL_KEY] = new SharedSessionService(
      sessionHub,
      dispatchPromptToHostSession,
      broadcaster,
    );
  }
  return g[GLOBAL_KEY] as SharedSessionService;
}

export * from "./types";
export * from "./service";
export * from "./event-broadcaster";

