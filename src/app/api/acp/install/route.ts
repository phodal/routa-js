/**
 * ACP Agent Installation API Route - /api/acp/install
 *
 * Handles installation and uninstallation of ACP agents.
 *
 * POST /api/acp/install - Install an agent
 *   Body: { agentId: string, distributionType?: "npx" | "uvx" | "binary" }
 *
 * DELETE /api/acp/install - Uninstall an agent
 *   Body: { agentId: string }
 */

import { NextRequest, NextResponse } from "next/server";
import {
  installFromRegistry,
  uninstallBinaryAgent,
  type DistributionType,
} from "@/core/acp/acp-installer";
import { getRegistryAgent } from "@/core/acp/acp-registry";
import { AcpWarmupService } from "@/core/acp/acp-warmup";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId, distributionType } = body as {
      agentId: string;
      distributionType?: DistributionType;
    };

    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 }
      );
    }

    // Verify agent exists in registry
    const agent = await getRegistryAgent(agentId);
    if (!agent) {
      return NextResponse.json(
        { error: `Agent "${agentId}" not found in registry` },
        { status: 404 }
      );
    }

    console.log(`[ACP Install API] Installing agent: ${agentId} (type: ${distributionType ?? "auto"})`);

    const result = await installFromRegistry(agentId, distributionType);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          agentId,
          error: result.error,
        },
        { status: 500 }
      );
    }

    // Trigger background warmup for npx/uvx agents so first launch is instant
    if (result.distributionType === "npx" || result.distributionType === "uvx") {
      AcpWarmupService.getInstance().warmupInBackground(agentId);
    }

    return NextResponse.json({
      success: true,
      agentId,
      distributionType: result.distributionType,
      installedPath: result.installedPath,
      message: `Agent "${agent.name}" installed successfully`,
    });
  } catch (error) {
    console.error("[ACP Install API] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Installation failed" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { agentId } = body as { agentId: string };

    if (!agentId) {
      return NextResponse.json(
        { error: "Missing agentId" },
        { status: 400 }
      );
    }

    console.log(`[ACP Install API] Uninstalling agent: ${agentId}`);

    // Currently only binary agents can be uninstalled
    // npx/uvx agents run on-demand and don't need uninstallation
    const success = await uninstallBinaryAgent(agentId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          agentId,
          error: "Failed to uninstall agent (may not be a binary agent)",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      agentId,
      message: `Agent "${agentId}" uninstalled successfully`,
    });
  } catch (error) {
    console.error("[ACP Install API] Uninstall error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Uninstallation failed" },
      { status: 500 }
    );
  }
}

