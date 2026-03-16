/**
 * GET    /api/sandboxes/[id]          — Get sandbox info
 * DELETE /api/sandboxes/[id]          — Delete a sandbox
 */
import { NextRequest, NextResponse } from "next/server";
import { SandboxManager } from "@/core/sandbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** GET /api/sandboxes/:id */
export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const mgr = SandboxManager.getInstance();
  const info = mgr.getSandbox(id);
  if (!info) {
    return NextResponse.json({ error: `Sandbox not found: ${id}` }, { status: 404 });
  }
  return NextResponse.json(info);
}

/** DELETE /api/sandboxes/:id */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  try {
    const mgr = SandboxManager.getInstance();
    await mgr.deleteSandbox(id);
    return NextResponse.json({ message: `Sandbox ${id} deleted` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
