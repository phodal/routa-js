/**
 * GET /api/traces/:id — Get a single trace by ID.
 */

import { NextRequest, NextResponse } from "next/server";
import { getTraceReader } from "@/core/trace";

export const dynamic = "force-dynamic";

/**
 * GET /api/traces/:id — Get a single trace by ID.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const cwd = process.cwd();
    const reader = getTraceReader(cwd);

    const trace = await reader.getById(id);

    if (!trace) {
      return NextResponse.json(
        {
          error: "Trace not found",
          message: `Trace with ID '${id}' not found`,
        },
        { status: 404 }
      );
    }

    return NextResponse.json({ trace });
  } catch (error) {
    console.error("[Traces API] Get by ID error:", error);
    return NextResponse.json(
      {
        error: "Failed to get trace",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
