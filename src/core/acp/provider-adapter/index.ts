/**
 * Provider Adapter Module
 *
 * Factory and exports for provider adapters.
 * Use getProviderAdapter() to get the appropriate adapter for a provider type.
 */

export * from "./types";
export { BaseProviderAdapter } from "./base-adapter";
export { ClaudeCodeAdapter } from "./claude-adapter";
export { OpenCodeAdapter } from "./opencode-adapter";
export { StandardAcpAdapter } from "./standard-acp-adapter";

import type { IProviderAdapter, ProviderType } from "./types";
import { ClaudeCodeAdapter } from "./claude-adapter";
import { OpenCodeAdapter } from "./opencode-adapter";
import { StandardAcpAdapter } from "./standard-acp-adapter";

/**
 * Cache for adapter instances (singleton per provider type).
 */
const adapterCache = new Map<ProviderType, IProviderAdapter>();

/**
 * Get the appropriate provider adapter for a given provider type.
 * Returns a cached instance for efficiency.
 */
export function getProviderAdapter(provider: ProviderType | string): IProviderAdapter {
  // Normalize provider type
  const normalizedProvider = normalizeProviderType(provider);

  // Check cache
  const cached = adapterCache.get(normalizedProvider);
  if (cached) return cached;

  // Create new adapter
  const adapter = createAdapter(normalizedProvider);
  adapterCache.set(normalizedProvider, adapter);
  return adapter;
}

/**
 * Normalize a provider string to a ProviderType.
 */
function normalizeProviderType(provider: string): ProviderType {
  const lower = provider.toLowerCase();

  switch (lower) {
    case "claude":
    case "claude-code":
    case "claudecode":
      return "claude";

    case "opencode":
    case "open-code":
      return "opencode";

    case "kimi":
      return "kimi";

    case "gemini":
      return "gemini";

    case "copilot":
    case "github-copilot":
      return "copilot";

    case "codex":
    case "codex-acp":
      return "codex";

    case "auggie":
    case "augment":
      return "auggie";

    case "kiro":
    case "kiro-cli":
      return "kiro";

    default:
      return "standard";
  }
}

/**
 * Create an adapter instance for a provider type.
 */
function createAdapter(provider: ProviderType): IProviderAdapter {
  switch (provider) {
    case "claude":
      return new ClaudeCodeAdapter();

    case "opencode":
      return new OpenCodeAdapter();

    // All standard ACP providers use the same adapter with different type
    case "kimi":
    case "gemini":
    case "copilot":
    case "codex":
    case "auggie":
    case "kiro":
    case "standard":
    default:
      return new StandardAcpAdapter(provider);
  }
}

/**
 * Clear the adapter cache (useful for testing).
 */
export function clearAdapterCache(): void {
  adapterCache.clear();
}

/**
 * Get all known provider types.
 */
export function getKnownProviderTypes(): ProviderType[] {
  return [
    "claude",
    "opencode",
    "kimi",
    "gemini",
    "copilot",
    "codex",
    "auggie",
    "kiro",
    "standard",
  ];
}

