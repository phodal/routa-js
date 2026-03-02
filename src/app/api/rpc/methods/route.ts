/**
 * GET /api/rpc/methods — List available JSON-RPC 2.0 methods
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const SUPPORTED_METHODS = [
  "agents.list",
  "agents.get",
  "agents.create",
  "agents.delete",
  "agents.updateStatus",
];

export async function GET() {
  return NextResponse.json({ methods: SUPPORTED_METHODS });
}
