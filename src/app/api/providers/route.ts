/**
 * Providers API - Fast provider listing with lazy status checking
 * 
 * GET /api/providers - List all providers (instant, status may be "checking")
 * GET /api/providers?check=true - Check provider status (slower, but accurate)
 */

import { NextRequest, NextResponse } from "next/server";
import { getStandardPresets, getPresetById, resolveCommand } from "@/core/acp/acp-presets";
import { which } from "@/core/acp/utils";
import { fetchRegistry, detectPlatformTarget } from "@/core/acp/acp-registry";
import { isServerlessEnvironment } from "@/core/acp/api-based-providers";
import { isOpencodeServerConfigured } from "@/core/acp/opencode-sdk-adapter";

type ProviderStatus = "available" | "unavailable" | "checking";

interface ProviderInfo {
  id: string;
  name: string;
  description: string;
  command: string;
  status: ProviderStatus;
  source: "static" | "registry";
}

// In-memory cache with TTL
const cache = {
  providers: null as ProviderInfo[] | null,
  timestamp: 0,
  TTL: 30000, // 30 seconds
};

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const shouldCheck = searchParams.get("check") === "true";

  // Fast path: return cached or unchecked providers immediately
  if (!shouldCheck) {
    if (cache.providers && Date.now() - cache.timestamp < cache.TTL) {
      return NextResponse.json({ providers: cache.providers });
    }

    // Return all providers with "checking" status immediately
    const providers = await getProvidersWithoutChecking();
    return NextResponse.json({ providers });
  }

  // Slow path: check all provider statuses
  const providers = await getProvidersWithChecking();
  
  // Update cache
  cache.providers = providers;
  cache.timestamp = Date.now();

  return NextResponse.json({ providers });
}

/**
 * Fast: Return all providers without checking command availability
 */
async function getProvidersWithoutChecking(): Promise<ProviderInfo[]> {
  const providers: ProviderInfo[] = [];

  // In serverless environments (Vercel), only show OpenCode SDK
  // CLI-based providers are not supported in serverless
  if (isServerlessEnvironment()) {
    const sdkConfigured = isOpencodeServerConfigured();
    providers.push({
      id: "opencode-sdk",
      name: "OpenCode SDK",
      description: sdkConfigured
        ? "Connect to remote OpenCode server (configured)"
        : "Connect to remote OpenCode server - Set OPENCODE_SERVER_URL environment variable",
      command: "sdk",
      status: sdkConfigured ? "available" : "unavailable",
      source: "static",
    });
    console.log("[Providers API] Serverless environment: only OpenCode SDK is available");
    return providers;
  }

  // Non-serverless: show all CLI-based providers
  const allPresets = [...getStandardPresets()];
  const claudePreset = getPresetById("claude");
  if (claudePreset) allPresets.push(claudePreset);

  providers.push(...allPresets.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    command: p.command,
    status: "checking" as const,
    source: "static" as const,
  })));

  // Add registry agents (without checking)
  try {
    const registry = await fetchRegistry();
    const staticIds = new Set(providers.map((p) => p.id));

    for (const agent of registry.agents) {
      const dist = agent.distribution;
      let command = "";

      if (dist.npx) {
        command = `npx ${dist.npx.package}`;
      } else if (dist.uvx) {
        command = `uvx ${dist.uvx.package}`;
      } else if (dist.binary) {
        const platform = detectPlatformTarget();
        if (platform && dist.binary[platform]) {
          command = dist.binary[platform]!.cmd ?? agent.id;
        }
      }

      const providerId = staticIds.has(agent.id) ? `${agent.id}-registry` : agent.id;
      const providerName = staticIds.has(agent.id) ? `${agent.name} (Registry)` : agent.name;

      providers.push({
        id: providerId,
        name: providerName,
        description: agent.description,
        command,
        status: "checking",
        source: "registry",
      });
    }
  } catch (err) {
    console.warn("[Providers API] Failed to fetch registry:", err);
  }

  return providers;
}

/**
 * Slow: Check all provider command availability
 */
async function getProvidersWithChecking(): Promise<ProviderInfo[]> {
  const providers: ProviderInfo[] = [];

  // In serverless environments (Vercel), only show OpenCode SDK
  // CLI-based providers are not supported in serverless
  if (isServerlessEnvironment()) {
    const sdkConfigured = isOpencodeServerConfigured();
    providers.push({
      id: "opencode-sdk",
      name: "OpenCode SDK",
      description: sdkConfigured
        ? "Connect to remote OpenCode server (configured)"
        : "Connect to remote OpenCode server - Set OPENCODE_SERVER_URL environment variable",
      command: "sdk",
      status: sdkConfigured ? "available" : "unavailable",
      source: "static",
    });
    console.log("[Providers API] Serverless environment: only OpenCode SDK is available");
    return providers;
  }

  // Non-serverless: check all CLI-based providers
  const allPresets = [...getStandardPresets()];
  const claudePreset = getPresetById("claude");
  if (claudePreset) allPresets.push(claudePreset);

  // Check static presets in parallel
  const staticProviders: ProviderInfo[] = await Promise.all(
    allPresets.map(async (p): Promise<ProviderInfo> => {
      const cmd = resolveCommand(p);
      const resolved = await which(cmd);
      return {
        id: p.id,
        name: p.name,
        description: p.description,
        command: p.command,
        status: resolved ? "available" : "unavailable",
        source: "static",
      };
    })
  );

  // Add registry agents with checking
  const staticIds = new Set(staticProviders.map((p) => p.id));
  try {
    const registry = await fetchRegistry();
    const npxPath = await which("npx");
    const uvxPath = await which("uv");
    const platform = detectPlatformTarget();

    for (const agent of registry.agents) {
      const dist = agent.distribution;
      let command = "";
      let status: ProviderStatus = "unavailable";

      if (dist.npx && npxPath) {
        command = `npx ${dist.npx.package}`;
        status = "available";
      } else if (dist.uvx && uvxPath) {
        command = `uvx ${dist.uvx.package}`;
        status = "available";
      } else if (dist.binary && platform && dist.binary[platform]) {
        command = dist.binary[platform]!.cmd ?? agent.id;
        status = "unavailable";
      } else if (dist.npx) {
        command = `npx ${dist.npx.package}`;
        status = "unavailable";
      } else if (dist.uvx) {
        command = `uvx ${dist.uvx.package}`;
        status = "unavailable";
      }

      const providerId = staticIds.has(agent.id) ? `${agent.id}-registry` : agent.id;
      const providerName = staticIds.has(agent.id) ? `${agent.name} (Registry)` : agent.name;

      staticProviders.push({
        id: providerId,
        name: providerName,
        description: agent.description,
        command,
        status,
        source: "registry",
      });
    }
  } catch (err) {
    console.warn("[Providers API] Failed to fetch registry:", err);
  }

  providers.push(...staticProviders);

  // Sort: available first, then alphabetical
  providers.sort((a, b) => {
    if (a.status === b.status) return a.name.localeCompare(b.name);
    return a.status === "available" ? -1 : 1;
  });

  return providers;
}
