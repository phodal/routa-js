/**
 * NoteEventBroadcaster - SSE broadcaster for real-time note change notifications.
 *
 * Manages SSE connections from browser clients and broadcasts note changes
 * when agents or users update notes. This enables collaborative editing
 * where all connected clients see changes in real-time.
 */

import type { Note } from "../models/note";

export type NoteChangeEvent = {
  type: "note:created" | "note:updated" | "note:deleted";
  noteId: string;
  workspaceId: string;
  /** Source of the change */
  source: "agent" | "user" | "system";
  /** The updated note (not present for deletions) */
  note?: Note;
  /** Timestamp of the change */
  timestamp: string;
};

type SSEController = ReadableStreamDefaultController<Uint8Array>;

export class NoteEventBroadcaster {
  /**
   * SSE controllers keyed by a connection ID.
   * Multiple clients can subscribe to the same workspace.
   */
  private controllers = new Map<string, { controller: SSEController; workspaceId: string }>();
  private connectionCounter = 0;

  /**
   * Attach an SSE controller for a workspace.
   * Returns a connection ID used for detaching.
   */
  attach(workspaceId: string, controller: SSEController): string {
    const connId = `note-sse-${++this.connectionCounter}`;
    this.controllers.set(connId, { controller, workspaceId });

    // Send a "connected" event
    this.writeSse(controller, {
      type: "connected",
      connectionId: connId,
      workspaceId,
      timestamp: new Date().toISOString(),
    });

    return connId;
  }

  /**
   * Detach an SSE controller.
   */
  detach(connId: string): void {
    this.controllers.delete(connId);
  }

  /**
   * Broadcast a note change to all connected clients for the workspace.
   */
  broadcast(event: NoteChangeEvent): void {
    for (const [connId, { controller, workspaceId }] of this.controllers) {
      if (workspaceId !== event.workspaceId && workspaceId !== "*") continue;
      try {
        this.writeSse(controller, event);
      } catch {
        // Controller closed, remove it
        this.controllers.delete(connId);
      }
    }
  }

  /**
   * Broadcast a note creation.
   */
  notifyCreated(note: Note, source: NoteChangeEvent["source"] = "system"): void {
    this.broadcast({
      type: "note:created",
      noteId: note.id,
      workspaceId: note.workspaceId,
      source,
      note: { ...note },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast a note update.
   */
  notifyUpdated(note: Note, source: NoteChangeEvent["source"] = "system"): void {
    this.broadcast({
      type: "note:updated",
      noteId: note.id,
      workspaceId: note.workspaceId,
      source,
      note: { ...note },
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Broadcast a note deletion.
   */
  notifyDeleted(noteId: string, workspaceId: string, source: NoteChangeEvent["source"] = "system"): void {
    this.broadcast({
      type: "note:deleted",
      noteId,
      workspaceId,
      source,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the number of active connections.
   */
  get connectionCount(): number {
    return this.controllers.size;
  }

  private writeSse(controller: SSEController, payload: unknown): void {
    const encoder = new TextEncoder();
    const event = `data: ${JSON.stringify(payload)}\n\n`;
    controller.enqueue(encoder.encode(event));
  }
}

// ─── Singleton ──────────────────────────────────────────────────────────

const GLOBAL_KEY = "__note_event_broadcaster__";

export function getNoteEventBroadcaster(): NoteEventBroadcaster {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new NoteEventBroadcaster();
  }
  return g[GLOBAL_KEY] as NoteEventBroadcaster;
}
