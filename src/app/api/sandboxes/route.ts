/**
 * GET  /api/sandboxes  — List all sandboxes
 * POST /api/sandboxes  — Create a new sandbox
 */
import { NextRequest, NextResponse } from "next/server";
import { SandboxManager } from "@/core/sandbox";
import type { CreateSandboxRequest } from "@/core/sandbox";

export const dynamic = "force-dynamic";

/** GET /api/sandboxes */
export async function GET() {
  const mgr = SandboxManager.getInstance();
  return NextResponse.json({ sandboxes: mgr.listSandboxes() });
}

/** POST /api/sandboxes */
export async function POST(req: NextRequest) {
  let body: CreateSandboxRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.lang) {
    return NextResponse.json({ error: "Missing required field: lang" }, { status: 400 });
  }

  try {
    const mgr = SandboxManager.getInstance();
    const info = await mgr.createSandbox(body);
    return NextResponse.json(info, { status: 201 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("Only Python") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
