/**
 * /api/webhooks/configs — CRUD API for GitHub webhook trigger configurations.
 *
 * GET    /api/webhooks/configs                  → List all configs (optionally ?workspaceId=...)
 * GET    /api/webhooks/configs?id=<id>          → Get a single config
 * POST   /api/webhooks/configs                  → Create a new config
 * PUT    /api/webhooks/configs                  → Update an existing config
 * DELETE /api/webhooks/configs?id=<id>          → Delete a config
 */

import { NextRequest, NextResponse } from "next/server";
import { getGitHubWebhookStore } from "@/core/webhooks/webhook-store-factory";

export const dynamic = "force-dynamic";

// ─── GET ─────────────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const workspaceId = searchParams.get("workspaceId") ?? undefined;

    const store = getGitHubWebhookStore();

    if (id) {
      const config = await store.getConfig(id);
      if (!config) {
        return NextResponse.json({ error: "Webhook config not found" }, { status: 404 });
      }
      // Mask token in response
      return NextResponse.json(maskToken(config));
    }

    const configs = await store.listConfigs(workspaceId);
    return NextResponse.json({ configs: configs.map(maskToken) });
  } catch (err) {
    console.error("[WebhookConfigs] GET error:", err);
    return NextResponse.json({ error: "Failed to load webhook configs", details: String(err) }, { status: 500 });
  }
}

// ─── POST ────────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const { name, repo, githubToken, webhookSecret, eventTypes, labelFilter, triggerAgentId, workflowId, workspaceId, enabled, promptTemplate } = body;

    if (!name || !repo || !githubToken || !triggerAgentId || !Array.isArray(eventTypes) || eventTypes.length === 0) {
      return NextResponse.json(
        { error: "Required: name, repo, githubToken, triggerAgentId, eventTypes (non-empty array)" },
        { status: 400 }
      );
    }

    const store = getGitHubWebhookStore();
    const config = await store.createConfig({
      name,
      repo,
      githubToken,
      webhookSecret: webhookSecret ?? "",
      eventTypes,
      labelFilter: labelFilter ?? [],
      triggerAgentId,
      workflowId,
      workspaceId,
      enabled: enabled !== false,
      promptTemplate,
    });

    return NextResponse.json({ config: maskToken(config) }, { status: 201 });
  } catch (err) {
    console.error("[WebhookConfigs] POST error:", err);
    return NextResponse.json({ error: "Failed to create webhook config", details: String(err) }, { status: 500 });
  }
}

// ─── PUT ─────────────────────────────────────────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    if (!body || !body.id) {
      return NextResponse.json({ error: "Request body must include id" }, { status: 400 });
    }

    const store = getGitHubWebhookStore();
    const updated = await store.updateConfig(body);
    if (!updated) {
      return NextResponse.json({ error: "Webhook config not found" }, { status: 404 });
    }

    return NextResponse.json({ config: maskToken(updated) });
  } catch (err) {
    console.error("[WebhookConfigs] PUT error:", err);
    return NextResponse.json({ error: "Failed to update webhook config", details: String(err) }, { status: 500 });
  }
}

// ─── DELETE ──────────────────────────────────────────────────────────────────

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing required query param: id" }, { status: 400 });
    }

    const store = getGitHubWebhookStore();
    await store.deleteConfig(id);
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[WebhookConfigs] DELETE error:", err);
    return NextResponse.json({ error: "Failed to delete webhook config", details: String(err) }, { status: 500 });
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function maskToken<T extends { githubToken?: string }>(config: T): T {
  if (!config.githubToken) return config;
  return {
    ...config,
    githubToken: config.githubToken.length > 8
      ? `${config.githubToken.slice(0, 4)}...${config.githubToken.slice(-4)}`
      : "***",
  };
}
