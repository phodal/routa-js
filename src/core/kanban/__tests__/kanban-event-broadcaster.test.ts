import { describe, expect, it } from "vitest";
import { KanbanEventBroadcaster } from "../kanban-event-broadcaster";

function createController() {
  const chunks: string[] = [];
  const decoder = new TextDecoder();
  const controller = {
    enqueue(value: Uint8Array) {
      chunks.push(decoder.decode(value));
    },
  } as unknown as ReadableStreamDefaultController<Uint8Array>;
  return { controller, chunks };
}

describe("KanbanEventBroadcaster", () => {
  it("broadcasts only to subscribers in the matching workspace", () => {
    const broadcaster = new KanbanEventBroadcaster();
    const workspaceA = createController();
    const workspaceB = createController();

    broadcaster.attach("workspace-a", workspaceA.controller);
    broadcaster.attach("workspace-b", workspaceB.controller);

    broadcaster.notify({
      workspaceId: "workspace-a",
      entity: "task",
      action: "moved",
      resourceId: "task-1",
      source: "agent",
    });

    expect(workspaceA.chunks.some((chunk) => chunk.includes("\"workspaceId\":\"workspace-a\""))).toBe(true);
    expect(workspaceA.chunks.some((chunk) => chunk.includes("\"action\":\"moved\""))).toBe(true);
    expect(workspaceB.chunks.some((chunk) => chunk.includes("\"action\":\"moved\""))).toBe(false);
  });
});
