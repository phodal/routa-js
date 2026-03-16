/**
 * POST /api/sandboxes/[id]/execute — Execute code in a sandbox (NDJSON stream)
 *
 * Request: { "code": "print('hello')" }
 * Response: NDJSON stream of SandboxOutputEvent objects:
 *   {"text": "hello\n"}
 *   {"image": "<base64-png>"}
 *   {"error": "<traceback>"}
 */
import { NextRequest, NextResponse } from "next/server";
import { SandboxManager } from "@/core/sandbox";
import type { ExecuteRequest } from "@/core/sandbox";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

/** POST /api/sandboxes/:id/execute */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: ExecuteRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.code) {
    return NextResponse.json({ error: "Missing required field: code" }, { status: 400 });
  }

  try {
    const mgr = SandboxManager.getInstance();
    const upstream = await mgr.executeInSandbox(id, body);

    // Proxy the NDJSON stream from the in-sandbox server directly to the client.
    return new NextResponse(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson",
        "Transfer-Encoding": "chunked",
        "Cache-Control": "no-cache",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = message.includes("not found") ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
