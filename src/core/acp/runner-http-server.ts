import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { NextRequest } from "next/server";

import { GET as getAcp, POST as postAcp } from "@/app/api/acp/route";
import { DELETE as deleteSession, GET as getSession, PATCH as patchSession } from "@/app/api/sessions/[sessionId]/route";
import { POST as disconnectSession } from "@/app/api/sessions/[sessionId]/disconnect/route";

type RouteMatch =
  | { kind: "acp" }
  | { kind: "session"; sessionId: string }
  | { kind: "sessionDisconnect"; sessionId: string }
  | null;

export function matchRunnerRoute(pathname: string): RouteMatch {
  if (pathname === "/api/acp") {
    return { kind: "acp" };
  }

  const disconnectMatch = pathname.match(/^\/api\/sessions\/([^/]+)\/disconnect$/);
  if (disconnectMatch) {
    return {
      kind: "sessionDisconnect",
      sessionId: decodeURIComponent(disconnectMatch[1]),
    };
  }

  const sessionMatch = pathname.match(/^\/api\/sessions\/([^/]+)$/);
  if (sessionMatch) {
    return {
      kind: "session",
      sessionId: decodeURIComponent(sessionMatch[1]),
    };
  }

  return null;
}

async function readRequestBody(req: IncomingMessage): Promise<Uint8Array | undefined> {
  if (req.method === "GET" || req.method === "HEAD") return undefined;

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) return undefined;
  return Buffer.concat(chunks);
}

function toNextRequest(baseUrl: string, req: IncomingMessage, body?: Uint8Array): NextRequest {
  const url = new URL(req.url ?? "/", baseUrl);
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) {
      for (const entry of value) headers.append(key, entry);
    } else if (typeof value === "string") {
      headers.set(key, value);
    }
  }

  return new NextRequest(url, {
    method: req.method,
    headers,
    body,
    duplex: body ? "half" : undefined,
  });
}

async function writeResponse(nodeRes: ServerResponse, response: Response): Promise<void> {
  nodeRes.statusCode = response.status;
  response.headers.forEach((value, key) => {
    nodeRes.setHeader(key, value);
  });

  if (!response.body) {
    nodeRes.end();
    return;
  }

  const readable = Readable.fromWeb(response.body as ReadableStream<Uint8Array>);
  await new Promise<void>((resolve, reject) => {
    readable.on("error", reject);
    nodeRes.on("error", reject);
    nodeRes.on("close", resolve);
    readable.pipe(nodeRes);
  });
}

export async function handleRunnerRequest(baseUrl: string, req: IncomingMessage): Promise<Response> {
  const url = new URL(req.url ?? "/", baseUrl);
  const match = matchRunnerRoute(url.pathname);
  if (!match) {
    return new Response(JSON.stringify({ error: "Not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = await readRequestBody(req);
  const nextRequest = toNextRequest(baseUrl, req, body);

  if (match.kind === "acp") {
    if (req.method === "GET") return getAcp(nextRequest);
    if (req.method === "POST") return postAcp(nextRequest);
  }

  if (match.kind === "session") {
    const params = Promise.resolve({ sessionId: match.sessionId });
    if (req.method === "GET") return getSession(nextRequest, { params });
    if (req.method === "PATCH") return patchSession(nextRequest, { params });
    if (req.method === "DELETE") return deleteSession(nextRequest, { params });
  }

  if (match.kind === "sessionDisconnect" && req.method === "POST") {
    return disconnectSession(nextRequest, {
      params: Promise.resolve({ sessionId: match.sessionId }),
    });
  }

  return new Response(JSON.stringify({ error: "Method not allowed" }), {
    status: 405,
    headers: { "Content-Type": "application/json" },
  });
}

export async function startAcpRunnerServer(options?: { host?: string; port?: number }) {
  const host = options?.host ?? process.env.ROUTA_ACP_RUNNER_HOST ?? "127.0.0.1";
  const port = options?.port ?? Number.parseInt(process.env.ROUTA_ACP_RUNNER_PORT ?? "3310", 10);
  const baseUrl = `http://${host}:${port}`;

  const server = createServer(async (req, res) => {
    try {
      const response = await handleRunnerRequest(baseUrl, req);
      await writeResponse(res, response);
    } catch (error) {
      console.error("[ACP Runner] Unhandled request failure:", error);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader("Content-Type", "application/json");
      }
      res.end(JSON.stringify({
        error: error instanceof Error ? error.message : "Internal Server Error",
      }));
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  console.log(`[ACP Runner] Listening on ${baseUrl}`);
  return server;
}
