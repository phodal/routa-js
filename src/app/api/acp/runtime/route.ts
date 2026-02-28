/**
 * ACP Runtime API Route - /api/acp/runtime
 *
 * Mirrors the Rust server `GET /api/acp/runtime` and `POST /api/acp/runtime`.
 *
 * GET  /api/acp/runtime
 *   Returns the current platform and availability of all 4 runtimes
 *   (node, npx, uv, uvx) — managed (downloaded) or system (PATH).
 *
 * POST /api/acp/runtime
 *   Body: { runtime: "node" | "npx" | "uv" | "uvx" }
 *   Ensures the given runtime is available, downloading it if necessary.
 *   Returns the resolved path.
 */

import { NextRequest, NextResponse } from "next/server";
import { AcpRuntimeManager, type RuntimeType, type RuntimeInfo } from "@/core/acp/runtime-manager";

export const dynamic = "force-dynamic";

// ─── GET /api/acp/runtime ───────────────────────────────────────────────────

export async function GET() {
  try {
    const manager = AcpRuntimeManager.getInstance();
    const status = await manager.getRuntimeStatus();

    // Shape each runtime entry for the JSON response
    const runtimes: Record<string, object | null> = {};
    for (const [rt, info] of Object.entries(status.runtimes) as [RuntimeType, RuntimeInfo | null][]) {
      runtimes[rt] = info
        ? {
            runtime: info.runtime,
            path: info.path,
            version: info.version,
            managed: info.isManaged,
            available: true,
          }
        : null;
    }

    return NextResponse.json({
      platform: status.platform,
      runtimes,
    });
  } catch (error) {
    console.error("[ACP Runtime API] GET error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to get runtime status" },
      { status: 500 }
    );
  }
}

// ─── POST /api/acp/runtime ──────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { runtime } = body as { runtime?: string };

    const validRuntimes: RuntimeType[] = ["node", "npx", "uv", "uvx"];
    if (!runtime || !validRuntimes.includes(runtime as RuntimeType)) {
      return NextResponse.json(
        {
          error: `Invalid runtime. Must be one of: ${validRuntimes.join(", ")}`,
        },
        { status: 400 }
      );
    }

    const manager = AcpRuntimeManager.getInstance();
    const info = await manager.ensureRuntime(runtime as RuntimeType);

    return NextResponse.json({
      success: true,
      runtime: info.runtime,
      path: info.path,
      version: info.version,
      managed: info.isManaged,
    });
  } catch (error) {
    console.error("[ACP Runtime API] POST error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to ensure runtime",
      },
      { status: 500 }
    );
  }
}
