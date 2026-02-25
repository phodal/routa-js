/**
 * GET /api/traces/stats — Get trace statistics.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTraceReader } from "@/core/trace";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces/stats — Get trace statistics.
 */
export async function GET(_request: NextRequest) {
  try {
    const cwd = process.cwd();
    const reader = getTraceReader(cwd);

    const stats = await reader.stats();

    return NextResponse.json({ stats });
  } catch (error) {
    console.error("[Traces Stats API] Error:", error);
    return NextResponse.json(
      {
        error: "Failed to get trace statistics",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
