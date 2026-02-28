/**
 * Well-Known Agent Card endpoint
 * Route: GET /.well-known/agent-card.json
 *
 * Provides the standard A2A agent discovery endpoint as specified in the
 * A2A protocol spec Section 8.2.
 */

import { NextRequest, NextResponse } from "next/server";
import { getA2aSessionRegistry } from "@/core/a2a";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const registry = getA2aSessionRegistry();
  const baseUrl = `${request.nextUrl.protocol}//${request.nextUrl.host}`;

  const agentCard = registry.generateAgentCard(baseUrl);

  return NextResponse.json(agentCard, {
    headers: {
      "Cache-Control": "public, max-age=300", // 5 minute cache
      "Access-Control-Allow-Origin": "*",
      "Content-Type": "application/json",
    },
  });
}
