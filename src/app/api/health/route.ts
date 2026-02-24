/**
 * Health Check API - /api/health
 *
 * Returns the service status, useful for Docker/container health checks.
 *
 * GET /api/health  →  { status: "ok", timestamp: <ISO string> }
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok", timestamp: new Date().toISOString() });
}
