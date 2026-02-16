/**
 * A2A Sessions API - /api/a2a/sessions
 *
 * Discovery endpoint for A2A clients to list available backend sessions.
 * Returns session metadata including RPC endpoints and capabilities.
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2aSessionRegistry } from "@/core/a2a";

export const dynamic = "force-dynamic";

/**
 * GET /api/a2a/sessions - List all active sessions
 */
export async function GET(request: NextRequest) {
  const registry = getA2aSessionRegistry();
  
  // Construct base URL from request
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  
  const sessions = registry.listSessions(baseUrl);

  return NextResponse.json(
    {
      sessions,
      count: sessions.length,
    },
    {
      headers: {
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": "*", // Allow A2A clients from any origin
      },
    }
  );
}
