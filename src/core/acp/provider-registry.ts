/**
 * Provider Registry
 *
 * Central registry for managing multiple ACP provider configurations.
 * Supports:
 * - Factory pattern for provider creation
 * - Compound model IDs (provider:model format)
 * - Model tier-based resolution (fast/balanced/smart)
 * - Provider inheritance from parent to child agents
 *
 * Ported from Intent 0.2.11's ProviderRegistry implementation.
 */

import { AcpAgentPreset } from "./acp-presets";

// ─── Model Tier Configuration ─────────────────────────────────────────────

export type ModelTierType = "fast" | "balanced" | "smart";

/**
 * Model tiers define which model to use for each provider.
 * Keys are provider IDs, values map tier names to model identifiers.
 *
 * Note: Some providers (like opencode) have dynamic models that are
 * fetched at runtime, so they may not be listed here.
 */
export const PROVIDER_MODEL_TIERS: Record<string, Record<string, string>> = {
  claude: {
    fast: "haiku-4.5",
    balanced: "sonnet-4.5",
    smart: "opus-4.6",
  },
  claudeCodeSdk: {
    fast: "claude-3-5-haiku-20241022",
    balanced: "claude-3-5-sonnet-20241022",
    smart: "claude-3-5-sonnet-20241022", // Sonnet is the max for SDK
  },
  opencode: {
    // Models are dynamic - fetched from the CLI at runtime
    fast: "fast",
    balanced: "balanced",
    smart: "smart",
  },
};

// ─── Compound Model ID Utilities ───────────────────────────────────────────

export interface ParsedModelId {
  providerId: string;
  modelId: string;
}

/**
 * Parse a compound model ID (provider:model format).
 * If no provider is specified, returns the default provider.
 *
 * Examples:
 * - "claude:opus-4.6" → { providerId: "claude", modelId: "opus-4.6" }
 * - "opus-4.6" → { providerId: "opencode", modelId: "opus-4.6" }
 * - "sonnet-4.5" → { providerId: "opencode", modelId: "sonnet-4.5" }
 */
export function parseCompoundModelId(compoundModelId: string, defaultProviderId = "opencode"): ParsedModelId {
  if (compoundModelId.includes(":")) {
    const [providerId, ...modelParts] = compoundModelId.split(":");
    return { providerId, modelId: modelParts.join(":") };
  }
  return { providerId: defaultProviderId, modelId: compoundModelId };
}

/**
 * Create a compound model ID from provider and model.
 */
export function createCompoundModelId(providerId: string, modelId: string): string {
  return `${providerId}:${modelId}`;
}

/**
 * Check if a model ID is valid for a given provider.
 * A model is valid if it doesn't specify a different provider.
 */
export function isModelValidForProvider(model: string, targetProviderId: string): boolean {
  const { providerId: modelProvider } = parseCompoundModelId(model);
  return modelProvider === targetProviderId;
}

/**
 * Get the default model for a provider based on tier.
 * Returns the model identifier (not compound format).
 */
export function getModelForProvider(providerId: string, tier: ModelTierType): string {
  const tiers = PROVIDER_MODEL_TIERS[providerId];
  if (tiers && tiers[tier]) {
    return tiers[tier];
  }
  // Default fallback
  return tiers?.balanced ?? "balanced";
}

/**
 * Get the default provider ID.
 */
export function getDefaultProviderId(): string {
  return "opencode";
}

// ─── Provider Registry ─────────────────────────────────────────────────────

export interface ProviderCreateConfig {
  /** Provider identifier */
  provider: string;
  /** Workspace ID for scoping */
  workspaceId: string;
  /** Working directory */
  workspacePath: string;
  /** Optional model override */
  model?: string;
  /** Session ID */
  sessionId: string;
  /** Session mode ID */
  modeId?: string;
  /** Extra command-line arguments */
  extraArgs?: string[];
  /** Extra environment variables */
  extraEnv?: Record<string, string>;
  /** Whether to auto-initialize the provider */
  autoInitialize?: boolean;
}

export type ProviderFactory = (
  config: ProviderCreateConfig,
  autoInitialize?: boolean
) => Promise<unknown>;

export class ProviderRegistry {
  private static instance: ProviderRegistry;
  private registry = new Map<string, ProviderFactory>();

  private constructor() {}

  /**
   * Get the singleton ProviderRegistry instance.
   */
  static getInstance(): ProviderRegistry {
    if (!ProviderRegistry.instance) {
      ProviderRegistry.instance = new ProviderRegistry();
    }
    return ProviderRegistry.instance;
  }

  /**
   * Create a default registry with standard providers.
   */
  static createDefault(): ProviderRegistry {
    const reg = ProviderRegistry.getInstance();
    // Factories are registered by the AcpProcessManager
    // This is a placeholder for future registration
    return reg;
  }

  /**
   * Register a provider factory.
   */
  register(id: string, factory: ProviderFactory): void {
    this.registry.set(id.toLowerCase(), factory);
  }

  /**
   * Check if a provider is registered.
   */
  has(id: string): boolean {
    return this.registry.has(id.toLowerCase());
  }

  /**
   * Create a provider instance using the registered factory.
   */
  async create(
    id: string,
    config: ProviderCreateConfig,
    autoInitialize = true
  ): Promise<unknown> {
    const factory = this.registry.get(id.toLowerCase());
    if (!factory) {
      throw new Error(`Unknown provider: "${id}". Not registered in ProviderRegistry.`);
    }
    return factory(config, autoInitialize);
  }

  /**
   * Create using the default provider.
   */
  async createDefault(config: ProviderCreateConfig, autoInitialize = true): Promise<unknown> {
    return this.create(getDefaultProviderId(), config, autoInitialize);
  }

  /**
   * Get all registered provider IDs.
   */
  getRegisteredProviders(): string[] {
    return Array.from(this.registry.keys());
  }
}

// ─── Model Resolution for Specialists ───────────────────────────────────────

/**
 * Resolve the model to use for a specialist based on:
 * 1. Explicit model override
 * 2. Specialist's model tier
 * 3. Parent agent's provider (to ensure compatibility)
 *
 * Ensures child agents use models compatible with their parent's provider.
 */
export function resolveModelForSpecialist(
  specialistModel: string | undefined,
  specialistModelTier: ModelTierType,
  parentModel: string | undefined,
  parentProviderId: string | undefined
): string {
  // If specialist has an explicit model, validate it against parent's provider
  if (specialistModel) {
    if (parentProviderId && !isModelValidForProvider(specialistModel, parentProviderId)) {
      // Model specifies a different provider - discard it
      console.warn(
        `[ProviderRegistry] Specialist model "${specialistModel}" is not valid ` +
        `for parent provider "${parentProviderId}". Using tier-based resolution instead.`
      );
    } else {
      return specialistModel;
    }
  }

  // Use model tier with parent's provider
  const providerId = parentProviderId ?? getDefaultProviderId();
  const tierModel = getModelForProvider(providerId, specialistModelTier);

  // If we have a parent model with the same provider, use it as base
  if (parentModel) {
    const { providerId: parsedProviderId } = parseCompoundModelId(parentModel, providerId);
    if (parsedProviderId === providerId) {
      // Same provider - we can use tier-based model
      return createCompoundModelId(providerId, tierModel);
    }
  }

  // Return compound model ID
  return createCompoundModelId(providerId, tierModel);
}

/**
 * Extract the provider ID from a model string.
 * Returns undefined if the model doesn't specify a provider.
 */
export function extractProviderIdFromModel(model: string | undefined): string | undefined {
  if (!model) return undefined;
  const { providerId } = parseCompoundModelId(model);
  // If the parsed provider is the default, treat it as "no provider specified"
  return providerId === getDefaultProviderId() ? undefined : providerId;
}
