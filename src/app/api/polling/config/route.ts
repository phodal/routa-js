/**
 * GitHub Polling Configuration API
 *
 * GET  /api/polling/config - Get current polling configuration
 * POST /api/polling/config - Update polling configuration (enable/disable, interval)
 */

import { NextRequest, NextResponse } from "next/server";
import { getGitHubWebhookStore } from "@/core/webhooks/webhook-store-factory";
import { getRoutaSystem } from "@/core/routa-system";
import { getPollingAdapter } from "@/core/polling/github-polling-adapter";

function getAdapter() {
  const webhookStore = getGitHubWebhookStore();
  const system = getRoutaSystem();
  return getPollingAdapter(webhookStore, system.backgroundTaskStore);
}

export async function GET() {
  try {
    const adapter = getAdapter();
    const config = adapter.getConfig();

    return NextResponse.json({
      ok: true,
      config: {
        ...config,
        isRunning: adapter.isRunning(),
      },
    });
  } catch (err) {
    console.error("[PollingConfig] GET error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const adapter = getAdapter();
    const { enabled, intervalSeconds } = body;

    // Update config
    const updates: Record<string, unknown> = {};
    if (typeof enabled === "boolean") {
      updates.enabled = enabled;
    }
    if (typeof intervalSeconds === "number" && intervalSeconds >= 10) {
      updates.intervalSeconds = intervalSeconds;
    }

    adapter.updateConfig(updates);

    // Start/stop based on enabled state
    if (enabled === true) {
      adapter.start();
    } else if (enabled === false) {
      adapter.stop();
    }

    const config = adapter.getConfig();

    return NextResponse.json({
      ok: true,
      config: {
        ...config,
        isRunning: adapter.isRunning(),
      },
    });
  } catch (err) {
    console.error("[PollingConfig] POST error:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

