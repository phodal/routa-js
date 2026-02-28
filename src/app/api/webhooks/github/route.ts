/**
 * POST /api/webhooks/github
 *
 * This is the inbound endpoint that GitHub calls when events occur on
 * configured repositories. It:
 * 1. Reads the raw body (needed for HMAC verification)
 * 2. Delegates to handleGitHubWebhook() in the core handler
 * 3. Returns a quick 200 OK so GitHub doesn't retry
 *
 * Configure the webhook URL in your GitHub repo as:
 *   https://<your-domain>/api/webhooks/github
 */

import { NextRequest, NextResponse } from "next/server";
import { handleGitHubWebhook } from "@/core/webhooks/github-webhook-handler";
import { getGitHubWebhookStore } from "@/core/webhooks/webhook-store-factory";
import { getRoutaSystem } from "@/core/routa-system";

export const dynamic = "force-dynamic";

// Disable Next.js body parsing so we can read the raw buffer for signature verification.
export const config = { api: { bodyParser: false } };

export async function POST(request: NextRequest) {
  try {
    const eventType = request.headers.get("x-github-event");
    const signature = request.headers.get("x-hub-signature-256") ?? undefined;
    const delivery = request.headers.get("x-github-delivery") ?? "unknown";

    if (!eventType) {
      return NextResponse.json({ error: "Missing X-GitHub-Event header" }, { status: 400 });
    }

    // Read raw body as text (needed for HMAC verification)
    const rawBody = await request.text();

    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    console.log(`[Webhook] Received GitHub event: ${eventType} (delivery: ${delivery})`);

    const webhookStore = getGitHubWebhookStore();
    const system = getRoutaSystem();

    const result = await handleGitHubWebhook({
      eventType,
      signature,
      rawBody,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      payload: payload as any,
      webhookStore,
      backgroundTaskStore: system.backgroundTaskStore,
    });

    console.log(
      `[Webhook] Event ${eventType} processed: ${result.processed} triggered, ${result.skipped} skipped`
    );

    return NextResponse.json({
      ok: true,
      delivery,
      processed: result.processed,
      skipped: result.skipped,
    });
  } catch (err) {
    console.error("[Webhook] Error handling GitHub event:", err);
    // Always return 200 to prevent GitHub from retrying on server errors
    return NextResponse.json({ ok: false, error: String(err) });
  }
}

/**
 * GET /api/webhooks/github — health check / info endpoint.
 */
export async function GET() {
  return NextResponse.json({
    status: "ok",
    endpoint: "GitHub Webhook Receiver",
    info: "Configure this URL as a GitHub repository webhook to receive events.",
  });
}
