export { createRoutaAcpAgent } from "./routa-acp-agent";
export {
  AcpSessionManager,
  type AcpAgentConfig,
  type AcpSessionInfo,
} from "./acp-session-manager";
export {
  Processer, // backward-compatible alias
  getAcpProcessManager,
  getOpenCodeProcessManager, // backward-compatible alias
  buildConfigFromPreset,
  buildDefaultConfig,
  type AcpProcessConfig,
  type JsonRpcMessage,
  type NotificationHandler,
} from "./processer";
export {
  type AcpAgentPreset,
  type PresetSource,
  type PresetDistributionType,
  ACP_AGENT_PRESETS,
  getPresetById,
  getDefaultPreset,
  getStandardPresets,
  resolveCommand,
  detectInstalledPresets,
  // Registry-based presets
  registryAgentToPreset,
  fetchRegistryPresets,
  getRegistryPresetById,
  getAllAvailablePresets,
  getPresetByIdWithRegistry,
  syncPresetsWithRegistry,
} from "./acp-presets";

// Provider Registry exports
export {
  ProviderRegistry,
  parseCompoundModelId,
  createCompoundModelId,
  isModelValidForProvider,
  getModelForProvider,
  getDefaultProviderId,
  resolveModelForSpecialist,
  extractProviderIdFromModel,
  PROVIDER_MODEL_TIERS,
  type ParsedModelId,
  type ProviderFactory,
  type ProviderCreateConfig,
} from "./provider-registry";

export { which } from "./utils";

// ACP Registry exports
export {
  type RegistryAgent,
  type AcpRegistry,
  type AgentDistribution,
  type NpxDistribution,
  type UvxDistribution,
  type BinaryDistribution,
  type BinaryPlatformConfig,
  type PlatformTarget,
  ACP_REGISTRY_URL,
  fetchRegistry,
  getRegistryAgent,
  getAllRegistryAgents,
  getAgentsByDistributionType,
  clearRegistryCache,
  detectPlatformTarget,
} from "./acp-registry";

// ACP Installer exports
export {
  type DistributionType,
  type InstallResult,
  type InstalledAgent,
  isNpxAvailable,
  isUvxAvailable,
  installNpmPackage,
  downloadBinary,
  installFromRegistry,
  buildAgentCommand,
  listAgentsWithStatus,
  isAgentAvailable,
  uninstallBinaryAgent,
} from "./acp-installer";
export { AcpProcess } from "@/core/acp/acp-process";
export {
  ClaudeCodeProcess,
  buildClaudeCodeConfig,
  type ClaudeCodeProcessConfig,
} from "@/core/acp/claude-code-process";

// MCP Configuration exports
export {
  generateRoutaMcpConfig,
  generateRoutaMcpConfigJson,
  generateMultipleRoutaMcpConfigs,
  getDefaultRoutaMcpConfig,
  validateRoutaMcpConfig,
  type RoutaMcpConfig,
  type McpServerConfig,
} from "./mcp-config-generator";

export {
  ensureMcpForProvider,
  setupMcpForProvider,
  setupMcpForClaudeCode,
  setupMcpForAuggie,
  setupMcpForCodex,
  setupMcpForGemini,
  setupMcpForKimi,
  setupMcpForCopilot,
  providerSupportsMcp,
  isMcpConfigured,
  getMcpStatus,
  type McpSupportedProvider,
  type McpSetupResult,
} from "./mcp-setup";
