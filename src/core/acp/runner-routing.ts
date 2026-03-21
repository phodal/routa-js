import { NextRequest, NextResponse } from "next/server";
import { getHttpSessionStore } from "@/core/acp/http-session-store";
import { getAcpRunnerUrl } from "@/core/acp/execution-backend";

export const ACP_FORWARDED_HEADER = "x-routa-acp-forwarded";

export function isForwardedAcpRequest(request: NextRequest): boolean {
  return request.headers.get(ACP_FORWARDED_HEADER) === "1";
}

export async function getSessionRoutingRecord(sessionId: string) {
  const store = getHttpSessionStore();
  await store.hydrateFromDb();
  return store.getSession(sessionId);
}

export function getRequiredRunnerUrl(): string | null {
  return getAcpRunnerUrl() ?? null;
}

export function runnerUnavailableResponse(): NextResponse {
  return NextResponse.json(
    { error: "ACP runner is required for this session but ROUTA_ACP_RUNNER_URL is not configured" },
    { status: 503 }
  );
}

export async function proxyRequestToRunner(
  request: NextRequest,
  input: {
    runnerUrl: string;
    path: string;
    method?: string;
    body?: Record<string, unknown>;
  }
): Promise<Response> {
  const targetUrl = new URL(input.path, input.runnerUrl);
  const headers = new Headers();
  headers.set(ACP_FORWARDED_HEADER, "1");

  const init: RequestInit = {
    method: input.method ?? request.method,
    headers,
  };

  if (input.body) {
    headers.set("Content-Type", "application/json");
    init.body = JSON.stringify(input.body);
  } else if ((input.method ?? request.method) === "GET") {
    targetUrl.search = request.nextUrl.search;
  }

  const response = await fetch(targetUrl, init);
  return new Response(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
