/**
 * A2A Executor - Bridges A2A protocol calls to backend ACP sessions
 *
 * Note: This is a placeholder implementation. The actual A2A integration
 * is handled through the JSON-RPC endpoint in /api/a2a/rpc which provides
 * a simpler bridge to backend sessions without requiring full AgentExecutor.
 */

import {
  AgentExecutor,
  RequestContext,
  ExecutionEventBus,
} from "@a2a-js/sdk/server";
import { getHttpSessionStore } from "../acp/http-session-store";
import { RoutaSystem } from "../routa-system";

/**
 * Creates a placeholder A2A executor
 * The main A2A functionality is implemented via JSON-RPC in /api/a2a/rpc
 */
export function createA2aExecutor(system: RoutaSystem): AgentExecutor {
  return {
    async execute(
      requestContext: RequestContext,
      eventBus: ExecutionEventBus
    ): Promise<void> {
      // Placeholder - actual A2A requests are handled via /api/a2a/rpc
      console.log("A2A: Execute called (handled via JSON-RPC)");
    },

    async cancelTask(taskId: string): Promise<void> {
      console.log(`A2A: Task cancellation requested for task ${taskId}`);
    },
  };
}
