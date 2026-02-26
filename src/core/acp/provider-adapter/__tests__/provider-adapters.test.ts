/**
 * Provider Adapter Tests
 *
 * Tests for provider adapters from a use-case perspective.
 * Focus on real-world scenarios to find edge cases and bugs.
 */

import { describe, it, expect, beforeEach } from "vitest";
import { ClaudeCodeAdapter } from "../claude-adapter";
import { OpenCodeAdapter } from "../opencode-adapter";
import { StandardAcpAdapter } from "../standard-acp-adapter";
import { getProviderAdapter, clearAdapterCache } from "../index";
import type { NormalizedSessionUpdate } from "../types";

describe("Provider Adapter Factory", () => {
  beforeEach(() => {
    clearAdapterCache();
  });

  it("returns ClaudeCodeAdapter for claude provider", () => {
    const adapter = getProviderAdapter("claude");
    expect(adapter.getBehavior().type).toBe("claude");
    expect(adapter.getBehavior().immediateToolInput).toBe(true);
  });

  it("returns OpenCodeAdapter for opencode provider", () => {
    const adapter = getProviderAdapter("opencode");
    expect(adapter.getBehavior().type).toBe("opencode");
    expect(adapter.getBehavior().immediateToolInput).toBe(false);
  });

  it("returns StandardAcpAdapter for unknown providers", () => {
    const adapter = getProviderAdapter("some-unknown-provider");
    expect(adapter.getBehavior().type).toBe("standard");
  });

  it("normalizes provider names case-insensitively", () => {
    expect(getProviderAdapter("CLAUDE").getBehavior().type).toBe("claude");
    expect(getProviderAdapter("OpenCode").getBehavior().type).toBe("opencode");
    expect(getProviderAdapter("KIMI").getBehavior().type).toBe("kimi");
  });

  it("handles hyphenated provider names", () => {
    expect(getProviderAdapter("claude-code").getBehavior().type).toBe("claude");
    expect(getProviderAdapter("open-code").getBehavior().type).toBe("opencode");
  });
});

describe("ClaudeCodeAdapter", () => {
  const adapter = new ClaudeCodeAdapter();

  describe("tool_call normalization", () => {
    it("normalizes tool_call with immediate rawInput", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_123",
          kind: "view",
          title: "View File",
          rawInput: { filePath: "/path/to/file.ts" },
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result).not.toBeNull();
      expect(result.eventType).toBe("tool_call");
      expect(result.toolCall?.inputFinalized).toBe(true);
      expect(result.toolCall?.input).toEqual({ filePath: "/path/to/file.ts" });
      expect(result.toolCall?.name).toBe("view");
    });

    it("always sets inputFinalized to true (Claude behavior)", () => {
      // Even with empty rawInput, Claude adapter should set inputFinalized=true
      // because Claude Code protocol guarantees input is present
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_123",
          kind: "unknown-tool",
          rawInput: {},
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.inputFinalized).toBe(true);
    });
  });

  describe("agent_message_chunk normalization", () => {
    it("normalizes agent message chunks", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: "Hello, I'm analyzing your code..." },
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.eventType).toBe("agent_message");
      expect(result.message?.isChunk).toBe(true);
      expect(result.message?.content).toBe("Hello, I'm analyzing your code...");
      expect(result.message?.role).toBe("assistant");
    });
  });
});

describe("OpenCodeAdapter", () => {
  const adapter = new OpenCodeAdapter();

  describe("Deferred Input Pattern (Key Use Case)", () => {
    it("sets inputFinalized=false when rawInput is empty object", () => {
      // This is the key OpenCode behavior - rawInput comes later in update
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_opencode_1",
          kind: "read",
          title: "Read File",
          rawInput: {}, // Empty! Input will come in tool_call_update
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.inputFinalized).toBe(false);
      expect(result.toolCall?.input).toEqual({});
    });

    it("sets inputFinalized=true when rawInput has data in tool_call_update", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_opencode_1",
          kind: "read",
          rawInput: { filePath: "/path/to/file.ts" }, // Now we have input!
          status: "in_progress",
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.inputFinalized).toBe(true);
      expect(result.toolCall?.input).toEqual({ filePath: "/path/to/file.ts" });
    });

    it("sets inputFinalized=false when rawInput is undefined", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_opencode_2",
          kind: "execute",
          // rawInput is completely missing
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.inputFinalized).toBe(false);
    });

    it("handles tool_call_update completion with output", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId: "call_opencode_1",
          kind: "read",
          status: "completed",
          rawOutput: "file contents here...",
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.status).toBe("completed");
      expect(result.toolCall?.output).toBe("file contents here...");
    });
  });

  describe("Edge Cases", () => {
    it("handles null rawInput gracefully", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          toolCallId: "call_123",
          kind: "test",
          rawInput: null,
        },
      };

      const result = adapter.normalize("test-session", notification) as NormalizedSessionUpdate;

      expect(result.toolCall?.inputFinalized).toBe(false);
    });

    it("returns null for missing toolCallId", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "tool_call",
          // missing toolCallId
          kind: "read",
        },
      };

      const result = adapter.normalize("test-session", notification);

      expect(result).toBeNull();
    });

    it("returns null for unknown sessionUpdate type", () => {
      const notification = {
        sessionId: "test-session",
        update: {
          sessionUpdate: "some_unknown_type",
        },
      };

      const result = adapter.normalize("test-session", notification);

      expect(result).toBeNull();
    });
  });
});

describe("StandardAcpAdapter", () => {
  const adapter = new StandardAcpAdapter("kimi");

  it("handles both immediate and deferred input patterns", () => {
    // Test with immediate input
    const withInput = {
      sessionId: "test-session",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_1",
        kind: "read",
        rawInput: { path: "/file.ts" },
      },
    };

    const result1 = adapter.normalize("test-session", withInput) as NormalizedSessionUpdate;
    expect(result1.toolCall?.inputFinalized).toBe(true);

    // Test with deferred input
    const withoutInput = {
      sessionId: "test-session",
      update: {
        sessionUpdate: "tool_call",
        toolCallId: "call_2",
        kind: "read",
        rawInput: {},
      },
    };

    const result2 = adapter.normalize("test-session", withoutInput) as NormalizedSessionUpdate;
    expect(result2.toolCall?.inputFinalized).toBe(false);
  });

  it("supports handleDeferredInput method", () => {
    const update = {
      update: {
        toolCallId: "call_1",
        kind: "read",
        rawInput: { filePath: "/path/to/file.ts" },
      },
    };

    const result = adapter.handleDeferredInput?.("call_1", update);

    expect(result).not.toBeNull();
    expect(result?.input).toEqual({ filePath: "/path/to/file.ts" });
    expect(result?.inputFinalized).toBe(true);
  });
});

