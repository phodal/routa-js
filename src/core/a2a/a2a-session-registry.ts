/**
 * A2aSessionRegistry - Registry for exposing backend sessions via A2A protocol
 *
 * Tracks active backend sessions and provides discovery/metadata for A2A clients.
 * Integrates with HttpSessionStore to expose ACP sessions as A2A endpoints.
 */

import { AgentCard } from "@a2a-js/sdk";
import { getHttpSessionStore, RoutaSessionRecord } from "../acp/http-session-store";

export interface A2aSessionInfo {
  id: string;
  agentName: string;
  provider: string;
  status: string;
  capabilities: string[];
  rpcUrl: string;
  eventStreamUrl: string;
  createdAt: string;
}

/**
 * Registry for A2A-exposed sessions
 */
export class A2aSessionRegistry {
  private sessionStore = getHttpSessionStore();

  /**
   * Get all active sessions formatted for A2A discovery
   */
  listSessions(baseUrl: string): A2aSessionInfo[] {
    const sessions = this.sessionStore.listSessions();
    
    return sessions.map((session) => this.toA2aSessionInfo(session, baseUrl));
  }

  /**
   * Get a specific session by ID
   */
  getSession(sessionId: string, baseUrl: string): A2aSessionInfo | undefined {
    const session = this.sessionStore.getSession(sessionId);
    if (!session) return undefined;
    
    return this.toA2aSessionInfo(session, baseUrl);
  }

  /**
   * Convert internal session record to A2A session info
   */
  private toA2aSessionInfo(
    session: RoutaSessionRecord,
    baseUrl: string
  ): A2aSessionInfo {
    return {
      id: session.sessionId,
      agentName: `routa-${session.provider || "agent"}-${session.sessionId.slice(0, 8)}`,
      provider: session.provider || "unknown",
      status: "connected", // Simplified status
      capabilities: this.getSessionCapabilities(session),
      rpcUrl: `${baseUrl}/api/a2a/rpc?sessionId=${session.sessionId}`,
      eventStreamUrl: `${baseUrl}/api/a2a/rpc?sessionId=${session.sessionId}`,
      createdAt: session.createdAt,
    };
  }

  /**
   * Determine capabilities based on session provider
   */
  private getSessionCapabilities(session: RoutaSessionRecord): string[] {
    const baseCapabilities = [
      "initialize",
      "method_list",
    ];

    // ACP-based sessions support these methods (must match /api/a2a/rpc routing)
    const acpCapabilities = [
      "session/new",
      "session/prompt",
      "session/cancel",
      "session/load",
    ];

    // Routa-specific coordination tools (must match /api/a2a/rpc routing)
    const routaCapabilities = [
      "list_agents",
      "create_agent",
      "delegate_task",
      "message_agent",
    ];

    return [...baseCapabilities, ...acpCapabilities, ...routaCapabilities];
  }

  /**
   * Generate an A2A AgentCard for the Routa platform (A2A SDK v0.3.x compatible)
   */
  generateAgentCard(baseUrl: string): AgentCard {
    return {
      name: "Routa Multi-Agent Coordinator",
      description:
        "Multi-agent coordination platform that orchestrates AI agents for software development tasks. " +
        "Supports creating CRAFTER, GATE, and DEVELOPER agents to plan, implement, and verify code changes.",
      protocolVersion: "0.3.0",
      version: "0.2.0",
      url: `${baseUrl}/api/a2a/rpc`,
      skills: [
        {
          id: "agent-coordination",
          name: "Agent Coordination",
          description:
            "Create, delegate tasks to, and coordinate multiple AI agents for complex software development workflows",
          tags: ["coordination", "multi-agent", "orchestration", "planning"],
          examples: [
            "Create a new feature for user authentication",
            "Fix the bug in the payment processing module",
            "Refactor the database layer to use connection pooling",
          ],
          inputModes: ["text/plain"],
          outputModes: ["text/plain", "application/json"],
        },
        {
          id: "software-development",
          name: "Software Development",
          description:
            "Implement code changes, write tests, and deliver working software using specialized CRAFTER agents",
          tags: ["coding", "implementation", "development", "engineering"],
          examples: [
            "Implement a REST API endpoint for user management",
            "Write unit tests for the authentication service",
            "Add TypeScript types to the existing JavaScript codebase",
          ],
          inputModes: ["text/plain"],
          outputModes: ["text/plain", "application/json"],
        },
        {
          id: "code-verification",
          name: "Code Verification",
          description:
            "Review, validate, and verify code quality using specialized GATE agents",
          tags: ["review", "verification", "quality", "testing"],
          examples: [
            "Review the pull request for security vulnerabilities",
            "Verify the implementation meets the acceptance criteria",
            "Check the code for performance issues",
          ],
          inputModes: ["text/plain"],
          outputModes: ["text/plain", "application/json"],
        },
      ],
      capabilities: {
        streaming: true,
        pushNotifications: false,
      },
      defaultInputModes: ["text/plain"],
      defaultOutputModes: ["text/plain", "application/json"],
      additionalInterfaces: [
        {
          url: `${baseUrl}/api/a2a/rpc`,
          transport: "JSONRPC",
        },
        {
          url: `${baseUrl}/api/a2a/message`,
          transport: "HTTP",
        },
      ],
      documentationUrl: `${baseUrl}/a2a`,
    };
  }
}

// Singleton instance
const GLOBAL_KEY = "__a2a_session_registry__";

export function getA2aSessionRegistry(): A2aSessionRegistry {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new A2aSessionRegistry();
  }
  return g[GLOBAL_KEY] as A2aSessionRegistry;
}
