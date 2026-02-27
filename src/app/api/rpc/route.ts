/**
 * RPC API - /api/rpc
 *
 * JSON-RPC 2.0 endpoint for browser clients (web mode).
 * Handles agent management methods used by useAgentsRpc hook.
 *
 * Methods:
 *   agents.list         - List agents for a workspace
 *   agents.get          - Get agent by id
 *   agents.create       - Create a new agent
 *   agents.delete       - Delete an agent
 *   agents.updateStatus - Update agent status
 */

import { NextRequest, NextResponse } from "next/server";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

interface JsonRpcRequest {
  jsonrpc: "2.0";
  id?: string | number;
  method: string;
  params?: Record<string, unknown>;
}

interface JsonRpcResponse {
  jsonrpc: "2.0";
  id?: string | number;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function ok(id: JsonRpcRequest["id"], result: unknown): NextResponse {
  return NextResponse.json({ jsonrpc: "2.0", id, result } as JsonRpcResponse);
}

function err(id: JsonRpcRequest["id"], code: number, message: string, status = 200): NextResponse {
  return NextResponse.json(
    { jsonrpc: "2.0", id, error: { code, message } } as JsonRpcResponse,
    { status }
  );
}

export async function POST(request: NextRequest) {
  let body: JsonRpcRequest;
  try {
    body = await request.json();
  } catch {
    return err(undefined, -32700, "Parse error", 400);
  }

  if (!body || body.jsonrpc !== "2.0" || !body.method) {
    return err(body?.id, -32600, "Invalid Request", 400);
  }

  const system = getRoutaSystem();
  const { id, method, params = {} } = body;

  try {
    switch (method) {
      case "agents.list": {
        const workspaceId = (params.workspaceId as string) ?? "";
        const result = await system.tools.listAgents(workspaceId);
        return ok(id, result.data);
      }

      case "agents.get": {
        const agentId = params.id as string;
        if (!agentId) return err(id, -32602, "Missing required param: id");
        const result = await system.tools.getAgentStatus(agentId);
        if (!result.success) return err(id, -32001, result.error ?? "Agent not found");
        return ok(id, result.data);
      }

      case "agents.create": {
        const name = params.name as string;
        const role = params.role as string;
        const workspaceId = (params.workspaceId as string) ?? "";
        if (!name || !role) return err(id, -32602, "Missing required params: name, role");
        const result = await system.tools.createAgent({
          name,
          role,
          workspaceId,
          parentId: params.parentId as string | undefined,
          modelTier: params.modelTier as string | undefined,
        });
        if (!result.success) return err(id, -32001, result.error ?? "Failed to create agent");
        return ok(id, result.data);
      }

      case "agents.delete": {
        const agentId = params.id as string;
        if (!agentId) return err(id, -32602, "Missing required param: id");
        await system.agentStore.delete(agentId);
        return ok(id, { ok: true });
      }

      case "agents.updateStatus": {
        const agentId = params.id as string;
        const status = params.status as string;
        if (!agentId || !status) return err(id, -32602, "Missing required params: id, status");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await system.agentStore.updateStatus(agentId, status as any);
        return ok(id, { ok: true });
      }

      default:
        return err(id, -32601, `Method not found: ${method}`);
    }
  } catch (e) {
    console.error("[/api/rpc] Error:", e);
    return err(id, -32603, e instanceof Error ? e.message : "Internal error");
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
