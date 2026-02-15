/**
 * Orchestrator Singleton
 *
 * Provides a global instance of the RoutaOrchestrator.
 * Initialized when the first orchestrated session is created.
 */

import { RoutaOrchestrator, OrchestratorConfig } from "./orchestrator";
import { getRoutaSystem } from "../routa-system";
import { getAcpProcessManager } from "../acp/processer";

// Use globalThis to survive HMR in Next.js dev mode
const GLOBAL_KEY = "__routa_orchestrator__";

/**
 * Get or create the global RoutaOrchestrator instance.
 */
export function getRoutaOrchestrator(): RoutaOrchestrator | undefined {
  return (globalThis as Record<string, unknown>)[GLOBAL_KEY] as RoutaOrchestrator | undefined;
}

/**
 * Initialize the orchestrator with configuration.
 * Called when the first orchestrated session is created.
 */
export function initRoutaOrchestrator(
  config?: Partial<OrchestratorConfig>
): RoutaOrchestrator {
  const existing = getRoutaOrchestrator();
  if (existing) {
    return existing;
  }

  const system = getRoutaSystem();
  const processManager = getAcpProcessManager();

  const fullConfig: OrchestratorConfig = {
    defaultCrafterProvider: config?.defaultCrafterProvider ?? "claude",
    defaultGateProvider: config?.defaultGateProvider ?? "claude",
    defaultCwd: config?.defaultCwd ?? process.cwd(),
    serverPort: config?.serverPort ?? process.env.PORT,
  };

  const orchestrator = new RoutaOrchestrator(system, processManager, fullConfig);
  (globalThis as Record<string, unknown>)[GLOBAL_KEY] = orchestrator;

  console.log(
    `[Orchestrator] Initialized with defaultCrafterProvider=${fullConfig.defaultCrafterProvider}, defaultGateProvider=${fullConfig.defaultGateProvider}`
  );

  return orchestrator;
}

/**
 * Reset the orchestrator (for testing).
 */
export function resetRoutaOrchestrator(): void {
  delete (globalThis as Record<string, unknown>)[GLOBAL_KEY];
}
