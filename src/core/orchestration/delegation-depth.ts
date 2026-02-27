/**
 * Delegation Depth Tracking
 *
 * Prevents unbounded recursive agent creation by tracking delegation depth.
 * Maximum depth is set to 2 levels:
 * - Depth 0: User-created agents (no delegation)
 * - Depth 1: First-level delegated agents (children of user-created agents)
 * - Depth 2: Second-level delegated agents (grandchildren - maximum allowed)
 *
 * Ported from Intent 0.2.11's delegation depth implementation.
 */

import type { AgentStore } from "../store/agent-store";

// ─── Constants ─────────────────────────────────────────────────────────────

/**
 * Maximum delegation depth to prevent unbounded recursive agent creation.
 * Depth 0 = user-created agents, depth 1 = their children, depth 2 = grandchildren (max).
 */
export const MAX_DELEGATION_DEPTH = 2;

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DelegationDepthCheck {
  /** Whether delegation is allowed */
  allowed: boolean;
  /** Current depth of the parent agent */
  currentDepth: number;
  /** Error message if not allowed */
  error?: string;
}

// ─── Depth Tracking Functions ───────────────────────────────────────────────

/**
 * Get the delegation depth of an agent by loading its metadata from the store.
 * Returns 0 if the agent has no depth metadata or if loading fails (permissive default).
 *
 * @param agentStore - The agent store to query
 * @param agentId - The agent ID to check
 * @returns The agent's delegation depth (0 if not set or on error)
 */
export async function getDelegationDepth(
  agentStore: AgentStore,
  agentId: string
): Promise<number> {
  try {
    const agent = await agentStore.get(agentId);
    if (agent?.metadata) {
      const depth = agent.metadata.delegationDepth;
      if (typeof depth === "string") {
        return parseInt(depth, 10) || 0;
      }
      return depth ?? 0;
    }
    return 0;
  } catch (error) {
    console.warn(
      `[DelegationDepth] Failed to get depth for agent ${agentId}, defaulting to 0:`,
      error
    );
    return 0; // Permissive default
  }
}

/**
 * Check if an agent is allowed to create sub-agents based on its delegation depth.
 *
 * @param agentStore - The agent store to query
 * @param agentId - The agent ID to check
 * @returns A check result indicating whether delegation is allowed
 */
export async function checkDelegationDepth(
  agentStore: AgentStore,
  agentId: string
): Promise<DelegationDepthCheck> {
  const parentDepth = await getDelegationDepth(agentStore, agentId);

  if (parentDepth >= MAX_DELEGATION_DEPTH) {
    return {
      allowed: false,
      currentDepth: parentDepth,
      error: `Cannot create sub-agent: maximum delegation depth (${MAX_DELEGATION_DEPTH}) reached. ` +
        `You are at depth ${parentDepth}. Please complete this task directly instead of delegating further.`,
    };
  }

  return {
    allowed: true,
    currentDepth: parentDepth,
  };
}

/**
 * Calculate the delegation depth for a child agent.
 * Child depth is always parent depth + 1.
 *
 * @param parentDepth - The parent agent's delegation depth
 * @returns The child agent's delegation depth
 */
export function calculateChildDepth(parentDepth: number): number {
  return parentDepth + 1;
}

/**
 * Create metadata entry for delegation depth.
 * Converts the number to a string for storage in Agent.metadata.
 *
 * @param depth - The delegation depth
 * @returns Metadata object with delegationDepth
 */
export function createDelegationMetadata(depth: number): Record<string, string> {
  return {
    delegationDepth: String(depth),
  };
}

/**
 * Build complete agent metadata including delegation depth and other tracking info.
 *
 * @param depth - The delegation depth
 * @param createdByAgentId - The parent agent ID
 * @param specialist - The specialist ID
 * @param additionalMetadata - Any additional metadata to include
 * @returns Complete metadata object
 */
export function buildAgentMetadata(
  depth: number,
  createdByAgentId?: string,
  specialist?: string,
  additionalMetadata?: Record<string, string>
): Record<string, string> {
  const metadata: Record<string, string> = {
    ...createDelegationMetadata(depth),
    ...additionalMetadata,
  };

  if (createdByAgentId) {
    metadata.createdByAgentId = createdByAgentId;
  }

  if (specialist) {
    metadata.specialist = specialist;
  }

  return metadata;
}
