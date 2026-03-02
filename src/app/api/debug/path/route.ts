/**
 * GET /api/debug/path — Debug endpoint returning resolved binary paths.
 *
 * Only meaningful in the Rust desktop backend where shell PATH needs explicit
 * resolution. In Next.js this returns minimal info for API parity.
 */

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    path: process.env.PATH ?? "",
    platform: process.platform,
    runtime: "next.js",
  });
}
