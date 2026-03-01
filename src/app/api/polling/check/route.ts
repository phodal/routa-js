/**
 * GitHub Polling Manual Check API
 *
 * POST /api/polling/check - Manually trigger a poll check for all configured repos
 */

import { NextResponse } from "next/server";
import { getGitHubWebhookStore } from "@/core/webhooks/webhook-store-factory";
import { getRoutaSystem } from "@/core/routa-system";
import { getPollingAdapter } from "@/core/polling/github-polling-adapter";

export async function POST() {
  try {
    const webhookStore = getGitHubWebhookStore();
    const system = getRoutaSystem();
    const adapter = getPollingAdapter(webhookStore, system.backgroundTaskStore);

    console.log("[PollingCheck] Manual check triggered");

    const results = await adapter.checkNow();

    const totalFound = results.reduce((sum, r) => sum + r.eventsFound, 0);
    const totalProcessed = results.reduce((sum, r) => sum + r.eventsProcessed, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.eventsSkipped, 0);

    console.log(
      `[PollingCheck] Completed: ${totalFound} events found, ${totalProcessed} processed, ${totalSkipped} skipped`
    );

    return NextResponse.json({
      ok: true,
      checkedAt: new Date().toISOString(),
      summary: {
        reposChecked: results.length,
        totalEventsFound: totalFound,
        totalEventsProcessed: totalProcessed,
        totalEventsSkipped: totalSkipped,
      },
      results,
    });
  } catch (err) {
    console.error("[PollingCheck] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET() {
  // Return status info
  try {
    const webhookStore = getGitHubWebhookStore();
    const system = getRoutaSystem();
    const adapter = getPollingAdapter(webhookStore, system.backgroundTaskStore);
    const config = adapter.getConfig();

    return NextResponse.json({
      ok: true,
      isRunning: adapter.isRunning(),
      lastCheckedAt: config.lastCheckedAt?.toISOString() ?? null,
      intervalSeconds: config.intervalSeconds,
      enabled: config.enabled,
    });
  } catch (err) {
    console.error("[PollingCheck] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

