import { promises as fs } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";

const ASSET_BASE_DIR = path.resolve(
  process.cwd(),
  "tmp/codex-app-analysis/extracted/webview/assets",
);

export const dynamic = "force-dynamic";

function contentTypeFor(fileName: string): string {
  const extension = path.extname(fileName).toLowerCase();
  if (extension === ".js") return "application/javascript; charset=utf-8";
  if (extension === ".mjs") return "application/javascript; charset=utf-8";
  if (extension === ".wasm") return "application/wasm";
  if (extension === ".css") return "text/css; charset=utf-8";
  if (extension === ".map") return "application/json; charset=utf-8";
  if (extension === ".svg") return "image/svg+xml";
  if (extension === ".json") return "application/json; charset=utf-8";
  return "application/octet-stream";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  const rel = slug.join(path.sep);
  if (!rel || rel.startsWith("..")) {
    return NextResponse.json({ error: "Asset path is required" }, { status: 400 });
  }

  const safePath = path.normalize(rel);
  const filePath = path.join(ASSET_BASE_DIR, safePath);
  if (!filePath.startsWith(`${ASSET_BASE_DIR}${path.sep}`) && filePath !== ASSET_BASE_DIR) {
    return NextResponse.json({ error: "Invalid asset path" }, { status: 400 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": contentTypeFor(filePath),
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: `Asset not found: ${error instanceof Error ? error.message : ""}` },
      { status: 404 },
    );
  }
}
