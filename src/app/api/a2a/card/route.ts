/**
 * A2A Agent Card API - /api/a2a/card
 *
 * Returns the A2A agent card describing the Routa platform's capabilities.
 * Used by A2A clients for agent discovery.
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2aSessionRegistry } from "@/core/a2a";

export const dynamic = "force-dynamic";

/**
 * GET /api/a2a/card - Return A2A agent card
 */
export async function GET(request: NextRequest) {
  const registry = getA2aSessionRegistry();
  
  // Construct base URL from request
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;
  
  const agentCard = registry.generateAgentCard(baseUrl);

  return NextResponse.json(agentCard, {
    headers: {
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*", // Allow A2A clients from any origin
    },
  });
}
