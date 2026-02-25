/**
 * Provider Models API
 *
 * GET /api/providers/models?provider=<id>
 *
 * Runs the provider's model listing command and returns available models.
 * Extensible: add new providers to PROVIDER_MODEL_CONFIGS below.
 */

import { NextRequest, NextResponse } from "next/server";
import { which } from "@/core/acp/utils";
import { getServerBridge } from "@/core/platform";

interface ProviderModelConfig {
  /** CLI command to run */
  command: string;
  /** Arguments to pass */
  args: string[];
  /** Filter function: keep only valid model ID lines */
  filter: (line: string) => boolean;
}

/** Registry of providers that support model listing. Add new providers here. */
const PROVIDER_MODEL_CONFIGS: Record<string, ProviderModelConfig> = {
  opencode: {
    command: "opencode",
    args: ["models"],
    // opencode outputs lines like "anthropic/claude-3-5-sonnet-20241022"
    filter: (line) => line.length > 0 && line.includes("/"),
  },
  // Future providers:
  // gemini: { command: "gemini", args: ["models", "--list"], filter: ... },
};

// Simple in-memory cache: provider → { models, timestamp }
const modelsCache = new Map<string, { models: string[]; ts: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function GET(request: NextRequest) {
  const provider = request.nextUrl.searchParams.get("provider") ?? "";

  if (!provider) {
    return NextResponse.json({ models: [], error: "Missing provider param" }, { status: 400 });
  }

  // Cache hit
  const cached = modelsCache.get(provider);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json({ models: cached.models, cached: true });
  }

  const config = PROVIDER_MODEL_CONFIGS[provider];
  if (!config) {
    return NextResponse.json({ models: [], error: "Provider does not support model listing" });
  }

  const resolvedCmd = await which(config.command);
  if (!resolvedCmd) {
    return NextResponse.json({
      models: [],
      error: `'${config.command}' not found in PATH`,
    });
  }

  try {
    const bridge = getServerBridge();
    const fullCmd = [resolvedCmd, ...config.args].join(" ");
    const result = await Promise.race([
      bridge.process.exec(fullCmd, { timeout: 15000 }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Timeout")), 15000)
      ),
    ]);

    const stdout = typeof result === "string" ? result : (result as { stdout?: string }).stdout ?? "";
    const models = stdout
      .split("\n")
      .map((l: string) => l.trim())
      .filter(config.filter);

    modelsCache.set(provider, { models, ts: Date.now() });
    return NextResponse.json({ models });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(`[provider-models] Failed to list models for '${provider}':`, msg);
    return NextResponse.json({ models: [], error: msg });
  }
}
