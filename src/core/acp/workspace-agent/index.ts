/**
 * Workspace Agent — public API
 */

export { WorkspaceAgentAdapter } from "./workspace-agent-adapter";
export type { WorkspaceAgentAdapterOptions } from "./workspace-agent-adapter";
export {
  resolveWorkspaceAgentConfig,
  createLanguageModel,
  type WorkspaceAgentConfig,
  type WorkspaceAgentProvider,
} from "./workspace-agent-config";
export { WorkspaceAgentStateMachine, type AgentState, type AgentStateContext } from "./workspace-agent-state";
export { createCodingTools, createAgentManagementTools } from "./workspace-agent-tools";
export { WorkspaceAgentProviderAdapter } from "./workspace-agent-provider";
