/**
 * Orchestrator Singleton
 *
 * Provides a global instance of the RoutaOrchestrator.
 * Initialized when the first orchestrated session is created.
 */

import { RoutaOrchestrator, OrchestratorConfig } from "./orchestrator";
import { getRoutaSystem } from "../routa-system";
import { getAcpProcessManager } from "../acp/processer";

let _orchestrator: RoutaOrchestrator | undefined;

/**
 * Get or create the global RoutaOrchestrator instance.
 */
export function getRoutaOrchestrator(): RoutaOrchestrator | undefined {
  return _orchestrator;
}

/**
 * Initialize the orchestrator with configuration.
 * Called when the first orchestrated session is created.
 */
export function initRoutaOrchestrator(
  config?: Partial<OrchestratorConfig>
): RoutaOrchestrator {
  if (_orchestrator) {
    return _orchestrator;
  }

  const system = getRoutaSystem();
  const processManager = getAcpProcessManager();

  const fullConfig: OrchestratorConfig = {
    defaultCrafterProvider: config?.defaultCrafterProvider ?? "claude",
    defaultGateProvider: config?.defaultGateProvider ?? "claude",
    defaultCwd: config?.defaultCwd ?? process.cwd(),
  };

  _orchestrator = new RoutaOrchestrator(system, processManager, fullConfig);

  console.log(
    `[Orchestrator] Initialized with defaultCrafterProvider=${fullConfig.defaultCrafterProvider}, defaultGateProvider=${fullConfig.defaultGateProvider}`
  );

  return _orchestrator;
}

/**
 * Reset the orchestrator (for testing).
 */
export function resetRoutaOrchestrator(): void {
  _orchestrator = undefined;
}
