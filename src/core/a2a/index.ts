/**
 * A2A Core Module - Exports for A2A integration
 */

export { A2aSessionRegistry, getA2aSessionRegistry } from "./a2a-session-registry";
export { createA2aExecutor } from "./a2a-executor";
export type { A2aSessionInfo } from "./a2a-session-registry";
export { A2ATaskBridge, getA2ATaskBridge, mapAgentStatusToA2AState, mapAgentRoleToSkillId } from "./a2a-task-bridge";
export type { A2ATask, A2ATaskState, A2AMessage, A2APart, A2AArtifact, A2ATaskStatus } from "./a2a-task-bridge";
