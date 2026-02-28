/**
 * Unit tests for AgentEventBridge
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeEach } from "vitest";
import { AgentEventBridge, makeStartedEvent, makePlanUpdatedEvent } from "../agent-event-bridge/agent-event-bridge";
import type { NormalizedSessionUpdate } from "../provider-adapter/types";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeUpdate(
  overrides: Partial<NormalizedSessionUpdate>
): NormalizedSessionUpdate {
  return {
    sessionId: "sess-1",
    provider: "claude",
    eventType: "tool_call",
    timestamp: new Date(),
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("AgentEventBridge", () => {
  let bridge: AgentEventBridge;

  beforeEach(() => {
    bridge = new AgentEventBridge("sess-1");
  });

  // ── Lifecycle ──────────────────────────────────────────────────────────────

  describe("makeStartedEvent", () => {
    it("emits agent_started with correct fields", () => {
      const event = makeStartedEvent("sess-1", "claude");
      expect(event.type).toBe("agent_started");
      expect(event.sessionId).toBe("sess-1");
      if (event.type === "agent_started") {
        expect(event.provider).toBe("claude");
      }
    });
  });

  describe("turn_complete", () => {
    it("emits agent_completed with stopReason", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "turn_complete",
          turnComplete: { stopReason: "end_turn" },
        })
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent_completed");
      if (events[0].type === "agent_completed") {
        expect(events[0].stopReason).toBe("end_turn");
      }
    });

    it("emits usage_reported + agent_completed when usage present", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "turn_complete",
          turnComplete: {
            stopReason: "end_turn",
            usage: { inputTokens: 100, outputTokens: 50 },
          },
        })
      );
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe("usage_reported");
      expect(events[1].type).toBe("agent_completed");
    });
  });

  describe("error", () => {
    it("emits agent_failed", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "error",
          error: { code: "E001", message: "something went wrong" },
        })
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("agent_failed");
      if (events[0].type === "agent_failed") {
        expect(events[0].message).toBe("something went wrong");
      }
    });
  });

  // ── Messages ───────────────────────────────────────────────────────────────

  describe("agent_message", () => {
    it("emits message_block for assistant message", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "agent_message",
          message: { role: "assistant", content: "Hello!", isChunk: false },
        })
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message_block");
      if (events[0].type === "message_block") {
        expect(events[0].content).toBe("Hello!");
        expect(events[0].isChunk).toBe(false);
      }
    });

    it("emits message_block with isChunk=true for streaming", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "agent_message",
          message: { role: "assistant", content: "chunk", isChunk: true },
        })
      );
      expect(events[0].type).toBe("message_block");
      if (events[0].type === "message_block") {
        expect(events[0].isChunk).toBe(true);
      }
    });
  });

  describe("agent_thought", () => {
    it("emits thought_block", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "agent_thought",
          message: { role: "assistant", content: "thinking...", isChunk: false },
        })
      );
      expect(events[0].type).toBe("thought_block");
    });
  });

  // ── Tool Calls ─────────────────────────────────────────────────────────────

  describe("tool_call — read kind", () => {
    it("emits read_block for 'read' tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-1",
            name: "read",
            status: "running",
            inputFinalized: true,
            input: { path: "src/index.ts" },
          },
        })
      );
      expect(events[0].type).toBe("read_block");
      if (events[0].type === "read_block") {
        expect(events[0].files).toContain("src/index.ts");
        expect(events[0].status).toBe("in_progress");
      }
    });

    it("emits read_block for 'glob' tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-2",
            name: "glob",
            status: "running",
            inputFinalized: true,
            input: { pattern: "**/*.ts" },
          },
        })
      );
      expect(events[0].type).toBe("read_block");
    });
  });

  describe("tool_call — edit kind", () => {
    it("emits file_changes_block for 'write' tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-3",
            name: "write",
            status: "running",
            inputFinalized: true,
            input: { path: "src/foo.ts", content: "export const x = 1;" },
          },
        })
      );
      expect(events[0].type).toBe("file_changes_block");
      if (events[0].type === "file_changes_block") {
        expect(events[0].changes[0].path).toBe("src/foo.ts");
        expect(events[0].changes[0].changeType).toBe("create");
      }
    });

    it("emits file_changes_block for 'edit' tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-4",
            name: "edit",
            status: "running",
            inputFinalized: true,
            input: { path: "src/bar.ts" },
          },
        })
      );
      expect(events[0].type).toBe("file_changes_block");
      if (events[0].type === "file_changes_block") {
        expect(events[0].changes[0].changeType).toBe("edit");
      }
    });

    it("emits file_changes_block for 'str_replace_based_edit_tool'", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-5",
            name: "str_replace_based_edit_tool",
            status: "running",
            inputFinalized: true,
            input: { path: "src/baz.ts" },
          },
        })
      );
      expect(events[0].type).toBe("file_changes_block");
    });
  });

  describe("tool_call — execute kind", () => {
    it("emits terminal_block for 'bash' tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-6",
            name: "bash",
            status: "running",
            inputFinalized: true,
            input: { command: "npm test" },
          },
        })
      );
      expect(events[0].type).toBe("terminal_block");
      if (events[0].type === "terminal_block") {
        expect(events[0].command).toBe("npm test");
      }
    });
  });

  describe("tool_call — mcp kind", () => {
    it("emits mcp_block for mcp__ prefixed tool", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-7",
            name: "mcp__filesystem__read_file",
            status: "running",
            inputFinalized: true,
            input: { path: "/tmp/foo" },
          },
        })
      );
      expect(events[0].type).toBe("mcp_block");
      if (events[0].type === "mcp_block") {
        expect(events[0].toolName).toBe("mcp__filesystem__read_file");
      }
    });
  });

  describe("tool_call — other kind", () => {
    it("emits tool_call_block for unknown tools", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-8",
            name: "some_custom_tool",
            status: "running",
            inputFinalized: true,
          },
        })
      );
      expect(events[0].type).toBe("tool_call_block");
    });
  });

  // ── Tool Call Update (stateful) ────────────────────────────────────────────

  describe("tool_call_update", () => {
    it("updates status to completed and cleans up state", () => {
      // First: tool_call starts
      bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-9",
            name: "bash",
            status: "running",
            inputFinalized: true,
            input: { command: "ls" },
          },
        })
      );

      // Then: tool_call_update completes it
      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call_update",
          toolCall: {
            toolCallId: "tc-9",
            name: "bash",
            status: "completed",
            inputFinalized: true,
            output: "file1.ts\nfile2.ts",
          },
        })
      );

      expect(events[0].type).toBe("terminal_block");
      if (events[0].type === "terminal_block") {
        expect(events[0].status).toBe("completed");
        expect(events[0].output).toBe("file1.ts\nfile2.ts");
      }
    });

    it("merges input from initial tool_call into update", () => {
      bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-10",
            name: "bash",
            status: "running",
            inputFinalized: true,
            input: { command: "echo hello" },
          },
        })
      );

      const events = bridge.process(
        makeUpdate({
          eventType: "tool_call_update",
          toolCall: {
            toolCallId: "tc-10",
            name: "bash",
            status: "completed",
            inputFinalized: true,
            // no input in update — should inherit from initial
          },
        })
      );

      expect(events[0].type).toBe("terminal_block");
      if (events[0].type === "terminal_block") {
        expect(events[0].command).toBe("echo hello");
      }
    });
  });

  // ── Plan (via NormalizedSessionUpdate) ────────────────────────────────

  describe("plan_update via NormalizedSessionUpdate", () => {
    it("emits plan_updated from normalized plan_update event", () => {
      const events = bridge.process(
        makeUpdate({
          eventType: "plan_update",
          planItems: [
            { description: "Write tests", status: "done" },
            { description: "Implement feature", status: "in_progress" },
            { description: "Review PR", status: "pending" },
          ],
        })
      );
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("plan_updated");
      if (events[0].type === "plan_updated") {
        expect(events[0].items[0].status).toBe("done");
        expect(events[0].items[1].status).toBe("in_progress");
        expect(events[0].items[2].status).toBe("pending");
      }
    });

    it("returns empty array when planItems is missing", () => {
      const events = bridge.process(
        makeUpdate({ eventType: "plan_update" })
      );
      expect(events).toHaveLength(0);
    });
  });

  // ── Plan ───────────────────────────────────────────────────────────────────

  describe("makePlanUpdatedEvent", () => {
    it("maps plan items with correct statuses", () => {
      const event = makePlanUpdatedEvent("sess-1", [
        { description: "Step 1", status: "completed" },
        { description: "Step 2", status: "in_progress" },
        { description: "Step 3", status: "pending" },
      ]);
      expect(event.type).toBe("plan_updated");
      if (event.type === "plan_updated") {
        expect(event.items[0].status).toBe("done");
        expect(event.items[1].status).toBe("in_progress");
        expect(event.items[2].status).toBe("pending");
      }
    });
  });

  // ── Cleanup ────────────────────────────────────────────────────────────────

  describe("cleanup", () => {
    it("clears internal state without throwing", () => {
      bridge.process(
        makeUpdate({
          eventType: "tool_call",
          toolCall: {
            toolCallId: "tc-cleanup",
            name: "bash",
            status: "running",
            inputFinalized: true,
          },
        })
      );
      expect(() => bridge.cleanup()).not.toThrow();
    });
  });
});
