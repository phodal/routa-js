/**
 * CRDTNoteStore - NoteStore backed by Yjs CRDT documents.
 *
 * Wraps InMemoryNoteStore with:
 * 1. CRDT documents for conflict-free concurrent editing
 * 2. Event broadcasting for real-time UI updates
 *
 * When an agent or user saves a note, the CRDT document is updated
 * with a minimal diff, and all connected SSE clients are notified.
 */

import { Note, NoteType, createSpecNote, SPEC_NOTE_ID } from "../models/note";
import type { NoteStore } from "../store/note-store";
import { CRDTDocumentManager } from "./crdt-document-manager";
import { NoteEventBroadcaster } from "./note-event-broadcaster";

export class CRDTNoteStore implements NoteStore {
  private notes = new Map<string, Note>();
  public readonly crdt: CRDTDocumentManager;

  constructor(
    private broadcaster: NoteEventBroadcaster,
    crdtManager?: CRDTDocumentManager
  ) {
    this.crdt = crdtManager ?? new CRDTDocumentManager();
  }

  private key(noteId: string, workspaceId: string): string {
    return `${workspaceId}:${noteId}`;
  }

  async save(note: Note, source: "agent" | "user" | "system" = "system"): Promise<void> {
    const k = this.key(note.id, note.workspaceId);
    const isNew = !this.notes.has(k);

    // Update CRDT document
    const existingContent = this.crdt.getContent(note.workspaceId, note.id);
    if (existingContent === undefined) {
      this.crdt.initializeWithContent(note.workspaceId, note.id, note.content);
    } else if (existingContent !== note.content) {
      this.crdt.updateContent(note.workspaceId, note.id, note.content);
    }

    // Store note metadata
    this.notes.set(k, { ...note });

    // Broadcast
    if (isNew) {
      this.broadcaster.notifyCreated(note, source);
    } else {
      this.broadcaster.notifyUpdated(note, source);
    }
  }

  async get(noteId: string, workspaceId: string): Promise<Note | undefined> {
    const note = this.notes.get(this.key(noteId, workspaceId));
    if (!note) return undefined;

    // Always read content from CRDT (it's the source of truth for content)
    const crdtContent = this.crdt.getContent(workspaceId, noteId);
    if (crdtContent !== undefined) {
      return { ...note, content: crdtContent };
    }
    return { ...note };
  }

  async listByWorkspace(workspaceId: string): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter((n) => n.workspaceId === workspaceId)
      .map((n) => {
        const crdtContent = this.crdt.getContent(n.workspaceId, n.id);
        return crdtContent !== undefined ? { ...n, content: crdtContent } : { ...n };
      });
  }

  async listByType(workspaceId: string, type: NoteType): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter((n) => n.workspaceId === workspaceId && n.metadata.type === type)
      .map((n) => {
        const crdtContent = this.crdt.getContent(n.workspaceId, n.id);
        return crdtContent !== undefined ? { ...n, content: crdtContent } : { ...n };
      });
  }

  async listByAssignedAgent(workspaceId: string, agentId: string): Promise<Note[]> {
    return Array.from(this.notes.values())
      .filter(
        (n) =>
          n.workspaceId === workspaceId &&
          n.metadata.assignedAgentIds?.includes(agentId)
      )
      .map((n) => {
        const crdtContent = this.crdt.getContent(n.workspaceId, n.id);
        return crdtContent !== undefined ? { ...n, content: crdtContent } : { ...n };
      });
  }

  async delete(noteId: string, workspaceId: string): Promise<void> {
    this.notes.delete(this.key(noteId, workspaceId));
    this.crdt.removeDocument(workspaceId, noteId);
    this.broadcaster.notifyDeleted(noteId, workspaceId);
  }

  async ensureSpec(workspaceId: string): Promise<Note> {
    const existing = await this.get(SPEC_NOTE_ID, workspaceId);
    if (existing) return existing;

    const spec = createSpecNote(workspaceId);
    await this.save(spec, "system");
    return spec;
  }
}
