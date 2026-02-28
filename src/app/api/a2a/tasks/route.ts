/**
 * A2A Tasks endpoint - HTTP+JSON REST binding
 *
 * GET /api/a2a/tasks           — ListTasks
 * 
 * Query params:
 *   workspaceId — filter by workspace
 *   contextId — filter by context
 *   status — filter by task state
 *   pageSize — max tasks to return (default 50)
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2ATaskBridge } from "@/core/a2a";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, A2A-Version",
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET(request: NextRequest) {
  const bridge = getA2ATaskBridge();
  const system = getRoutaSystem();

  const workspaceId = request.nextUrl.searchParams.get("workspaceId") ?? undefined;
  const contextId = request.nextUrl.searchParams.get("contextId") ?? undefined;
  const statusFilter = request.nextUrl.searchParams.get("status") ?? undefined;
  const pageSize = Math.min(
    parseInt(request.nextUrl.searchParams.get("pageSize") ?? "50"),
    100
  );

  // Sync existing Routa agents into the bridge (so they appear as A2A tasks)
  await syncRoutaAgentsToBridge(bridge, system, workspaceId);

  const tasks = bridge.listTasks({
    workspaceId,
    contextId,
    state: statusFilter,
  }).slice(0, pageSize);

  return NextResponse.json(
    {
      tasks,
      totalSize: tasks.length,
      pageSize,
      nextPageToken: "",
    },
    { headers: { "Cache-Control": "no-store", ...CORS_HEADERS } }
  );
}

/**
 * Sync Routa agents into the A2A task bridge for discovery
 */
async function syncRoutaAgentsToBridge(
  bridge: ReturnType<typeof getA2ATaskBridge>,
  system: ReturnType<typeof getRoutaSystem>,
  workspaceId?: string
) {
  try {
    // If we have a specific workspaceId, sync just that workspace
    // Otherwise, try to catch agents from all workspaces
    const workspaceIds: string[] = workspaceId ? [workspaceId] : [];

    if (!workspaceId) {
      // Try to fetch workspaces from store
      try {
        const ws = await system.workspaceStore.list();
        if (ws) {
          workspaceIds.push(...ws.map((w: { id: string }) => w.id));
        }
      } catch {
        // workspaceStore might not support listAll
      }
    }

    for (const wsId of workspaceIds) {
      const result = await system.tools.listAgents(wsId);
      if (result.success && Array.isArray(result.data)) {
        for (const agent of result.data as Array<{
          id: string;
          name: string;
          role: string;
          status: string;
          parentId?: string;
        }>) {
          // Register each agent as a task (bridge handles deduplication)
          const { AgentRole, AgentStatus } = await import("@/core/models/agent");
          bridge.registerAgentAsTask({
            id: agent.id,
            name: agent.name,
            role: (AgentRole[agent.role as keyof typeof AgentRole]) ?? AgentRole.ROUTA,
            status: (AgentStatus[agent.status as keyof typeof AgentStatus]) ?? AgentStatus.PENDING,
            workspaceId: wsId,
            createdAt: new Date(),
          });
        }
      }
    }
  } catch (err) {
    console.warn("[A2A tasks] Failed to sync Routa agents:", err);
  }
}

export { syncRoutaAgentsToBridge };
