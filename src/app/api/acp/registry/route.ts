/**
 * ACP Registry API Route - /api/acp/registry
 *
 * Provides access to the ACP agent registry with installation status.
 *
 * GET  /api/acp/registry           - List all agents with status
 * GET  /api/acp/registry?id=x      - Get specific agent details
 * POST /api/acp/registry/refresh   - Force refresh registry cache
 */

import { NextRequest, NextResponse } from "next/server";
import {
  fetchRegistry,
  getRegistryAgent,
  clearRegistryCache,
  detectPlatformTarget,
} from "@/core/acp/acp-registry";
import {
  listAgentsWithStatus,
  isNpxAvailable,
  isUvxAvailable,
  buildAgentCommand,
} from "@/core/acp/acp-installer";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const agentId = request.nextUrl.searchParams.get("id");
  const refresh = request.nextUrl.searchParams.get("refresh") === "true";

  try {
    // Force refresh if requested
    if (refresh) {
      clearRegistryCache();
    }

    // Get specific agent
    if (agentId) {
      const agent = await getRegistryAgent(agentId);
      if (!agent) {
        return NextResponse.json(
          { error: `Agent "${agentId}" not found` },
          { status: 404 }
        );
      }

      const cmd = await buildAgentCommand(agentId);
      const platform = detectPlatformTarget();

      return NextResponse.json({
        agent,
        installed: cmd !== null,
        platform,
        command: cmd,
      });
    }

    // List all agents with status
    const [agents, npxAvailable, uvxAvailable] = await Promise.all([
      listAgentsWithStatus(),
      isNpxAvailable(),
      isUvxAvailable(),
    ]);

    const platform = detectPlatformTarget();

    return NextResponse.json({
      agents,
      platform,
      runtimeAvailability: {
        npx: npxAvailable,
        uvx: uvxAvailable,
      },
    });
  } catch (error) {
    console.error("[ACP Registry API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to fetch registry" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    // Force refresh the registry cache
    clearRegistryCache();
    const registry = await fetchRegistry(true);

    return NextResponse.json({
      success: true,
      version: registry.version,
      agentCount: registry.agents.length,
      message: "Registry cache refreshed",
    });
  } catch (error) {
    console.error("[ACP Registry API] Refresh error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to refresh registry" },
      { status: 500 }
    );
  }
}

