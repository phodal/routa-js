"use client";

/**
 * useAgentsRpc — React hook for agent management via JSON-RPC.
 *
 * Uses `RoutaRpcClient` which automatically routes through Tauri IPC
 * (desktop) or HTTP /api/rpc (web).
 */

import { useState, useEffect, useCallback } from "react";
import { rpc } from "../rpc-client";
import {
  logRuntime,
  toErrorMessage,
} from "../utils/diagnostics";

export interface AgentInfo {
  id: string;
  name: string;
  role: string;
  modelTier: string;
  workspaceId: string;
  parentId?: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, string>;
}

export interface UseAgentsRpcReturn {
  agents: AgentInfo[];
  loading: boolean;
  error: string | null;
  fetchAgents: () => Promise<void>;
  createAgent: (params: {
    name: string;
    role: string;
    workspaceId?: string;
    parentId?: string;
    modelTier?: string;
    metadata?: Record<string, string>;
  }) => Promise<AgentInfo | null>;
  deleteAgent: (id: string) => Promise<void>;
  updateAgentStatus: (id: string, status: string) => Promise<void>;
}

export function useAgentsRpc(
  workspaceId: string,
): UseAgentsRpcReturn {
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await rpc.call<{ agents: AgentInfo[] }>("agents.list", {
        workspaceId,
      });
      setAgents(result.agents ?? []);
    } catch (err) {
      logRuntime("warn", "useAgentsRpc.fetchAgents", "Failed to fetch agents", err);
      setError(toErrorMessage(err) || "Failed to fetch agents");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const createAgent = useCallback(
    async (params: {
      name: string;
      role: string;
      workspaceId?: string;
      parentId?: string;
      modelTier?: string;
      metadata?: Record<string, string>;
    }): Promise<AgentInfo | null> => {
      try {
        const result = await rpc.call<{ agentId: string; agent: AgentInfo }>(
          "agents.create",
          { ...params, workspaceId: params.workspaceId ?? workspaceId },
        );
        // Refresh the list
        await fetchAgents();
        return result.agent;
      } catch (err) {
        logRuntime("warn", "useAgentsRpc.createAgent", "Failed to create agent", err);
        setError(toErrorMessage(err) || "Failed to create agent");
        return null;
      }
    },
    [workspaceId, fetchAgents],
  );

  const deleteAgent = useCallback(
    async (id: string): Promise<void> => {
      try {
        await rpc.call("agents.delete", { id });
        await fetchAgents();
      } catch (err) {
        logRuntime("warn", "useAgentsRpc.deleteAgent", "Failed to delete agent", err);
        setError(toErrorMessage(err) || "Failed to delete agent");
      }
    },
    [fetchAgents],
  );

  const updateAgentStatus = useCallback(
    async (id: string, status: string): Promise<void> => {
      try {
        await rpc.call("agents.updateStatus", { id, status });
        await fetchAgents();
      } catch (err) {
        logRuntime(
          "warn",
          "useAgentsRpc.updateAgentStatus",
          "Failed to update agent status",
          err,
        );
        setError(toErrorMessage(err) || "Failed to update agent status");
      }
    },
    [fetchAgents],
  );

  useEffect(() => {
    fetchAgents();
  }, [fetchAgents]);

  return {
    agents,
    loading,
    error,
    fetchAgents,
    createAgent,
    deleteAgent,
    updateAgentStatus,
  };
}
