/**
 * POST /api/webhooks/register — Register a webhook on a GitHub repository.
 * DELETE /api/webhooks/register — Remove a webhook from a GitHub repository.
 * GET /api/webhooks/register?repo=owner/repo&token=... — List repo webhooks.
 *
 * This uses the GitHub REST API to create/delete the hook on the remote repo,
 * pointing it at this server's /api/webhooks/github endpoint.
 */

import { NextRequest, NextResponse } from "next/server";
import {
  registerGitHubWebhook,
  deleteGitHubWebhook,
  listGitHubWebhooks,
} from "@/core/webhooks/github-webhook-handler";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { token, repo, webhookUrl, secret, events } = body;

    if (!token || !repo || !webhookUrl) {
      return NextResponse.json(
        { error: "Required: token, repo, webhookUrl" },
        { status: 400 }
      );
    }

    const result = await registerGitHubWebhook({
      token,
      repo,
      webhookUrl,
      secret: secret ?? "",
      events: events ?? ["issues", "pull_request", "check_run"],
    });

    return NextResponse.json({ hook: result }, { status: 201 });
  } catch (err) {
    console.error("[WebhookRegister] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");
    const repo = searchParams.get("repo");
    const hookId = parseInt(searchParams.get("hookId") ?? "0", 10);

    if (!token || !repo || !hookId) {
      return NextResponse.json({ error: "Required query params: token, repo, hookId" }, { status: 400 });
    }

    await deleteGitHubWebhook({ token, repo, hookId });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[WebhookRegister] DELETE error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token") ?? process.env.GITHUB_TOKEN;
    const repo = searchParams.get("repo");

    if (!token || !repo) {
      return NextResponse.json({ error: "Required query params: token, repo" }, { status: 400 });
    }

    const hooks = await listGitHubWebhooks({ token, repo });
    return NextResponse.json({ hooks });
  } catch (err) {
    console.error("[WebhookRegister] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
