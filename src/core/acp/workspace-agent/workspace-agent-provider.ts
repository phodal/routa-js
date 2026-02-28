/**
 * Workspace Agent Provider Adapter
 *
 * Normalizes workspace agent notifications into NormalizedSessionUpdate.
 * Since the adapter emits notifications in the same format as Claude Code
 * (immediate tool input, streaming chunks), it reuses ClaudeCodeAdapter logic.
 */

import { ClaudeCodeAdapter } from "../provider-adapter/claude-adapter";
import type { ProviderBehavior } from "../provider-adapter/types";

export class WorkspaceAgentProviderAdapter extends ClaudeCodeAdapter {
  getBehavior(): ProviderBehavior {
    return {
      type: "workspace" as ProviderBehavior["type"],
      immediateToolInput: true,
      streaming: true,
    };
  }
}
