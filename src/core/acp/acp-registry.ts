/**
 * ACP Registry - Fetch and parse agent definitions from ACP Registry
 *
 * Registry URL: https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json
 * Format: https://github.com/agentclientprotocol/registry/blob/main/FORMAT.md
 */

// ─── Registry Types ─────────────────────────────────────────────────────────

/** NPX distribution configuration */
export interface NpxDistribution {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}

/** UVX (Python) distribution configuration */
export interface UvxDistribution {
  package: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Binary distribution for a specific platform */
export interface BinaryPlatformConfig {
  archive: string;
  cmd: string;
  args?: string[];
  env?: Record<string, string>;
}

/** Platform identifiers for binary distribution */
export type PlatformTarget =
  | "darwin-aarch64"
  | "darwin-x86_64"
  | "linux-aarch64"
  | "linux-x86_64"
  | "windows-aarch64"
  | "windows-x86_64";

/** Binary distribution configuration (keyed by platform) */
export type BinaryDistribution = Partial<Record<PlatformTarget, BinaryPlatformConfig>>;

/** Agent distribution configuration */
export interface AgentDistribution {
  npx?: NpxDistribution;
  uvx?: UvxDistribution;
  binary?: BinaryDistribution;
}

/** Agent entry in the registry */
export interface RegistryAgent {
  id: string;
  name: string;
  version: string;
  description: string;
  repository?: string;
  authors: string[];
  license: string;
  icon?: string;
  distribution: AgentDistribution;
}

/** Full registry response */
export interface AcpRegistry {
  version: string;
  agents: RegistryAgent[];
  extensions?: unknown[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

export const ACP_REGISTRY_URL =
  "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

/** Cache duration for registry data (1 hour) */
const REGISTRY_CACHE_TTL_MS = 60 * 60 * 1000;

// ─── Registry Cache ─────────────────────────────────────────────────────────

interface RegistryCache {
  data: AcpRegistry | null;
  fetchedAt: number;
}

const registryCache: RegistryCache = {
  data: null,
  fetchedAt: 0,
};

// ─── Registry Functions ─────────────────────────────────────────────────────

/**
 * Fetch the ACP registry from the CDN.
 * Results are cached for 1 hour.
 *
 * @param forceRefresh - Skip cache and fetch fresh data
 */
export async function fetchRegistry(forceRefresh = false): Promise<AcpRegistry> {
  const now = Date.now();

  // Return cached data if still valid
  if (
    !forceRefresh &&
    registryCache.data &&
    now - registryCache.fetchedAt < REGISTRY_CACHE_TTL_MS
  ) {
    return registryCache.data;
  }

  console.log("[AcpRegistry] Fetching registry from:", ACP_REGISTRY_URL);

  const response = await fetch(ACP_REGISTRY_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch ACP registry: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as AcpRegistry;

  // Validate basic structure
  if (!data.version || !Array.isArray(data.agents)) {
    throw new Error("Invalid ACP registry format: missing version or agents array");
  }

  // Update cache
  registryCache.data = data;
  registryCache.fetchedAt = now;

  console.log(`[AcpRegistry] Loaded ${data.agents.length} agents (version: ${data.version})`);

  return data;
}

/**
 * Get a specific agent from the registry by ID.
 */
export async function getRegistryAgent(agentId: string): Promise<RegistryAgent | undefined> {
  const registry = await fetchRegistry();
  return registry.agents.find((a) => a.id === agentId);
}

/**
 * Get all agents from the registry.
 */
export async function getAllRegistryAgents(): Promise<RegistryAgent[]> {
  const registry = await fetchRegistry();
  return registry.agents;
}

/**
 * Get agents that support a specific distribution type.
 */
export async function getAgentsByDistributionType(
  type: "npx" | "uvx" | "binary"
): Promise<RegistryAgent[]> {
  const registry = await fetchRegistry();
  return registry.agents.filter((a) => a.distribution[type] !== undefined);
}

/**
 * Clear the registry cache.
 */
export function clearRegistryCache(): void {
  registryCache.data = null;
  registryCache.fetchedAt = 0;
}

/**
 * Detect the current platform target for binary distribution.
 */
export function detectPlatformTarget(): PlatformTarget | null {
  const platform = process.platform;
  const arch = process.arch;

  if (platform === "darwin") {
    return arch === "arm64" ? "darwin-aarch64" : "darwin-x86_64";
  }
  if (platform === "linux") {
    return arch === "arm64" ? "linux-aarch64" : "linux-x86_64";
  }
  if (platform === "win32") {
    return arch === "arm64" ? "windows-aarch64" : "windows-x86_64";
  }

  return null;
}

