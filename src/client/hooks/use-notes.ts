"use client";

/**
 * useNotes - React hook for collaborative note management.
 *
 * Provides:
 * - Fetching notes from the server
 * - Real-time updates via SSE subscription
 * - CRUD operations that sync to server
 * - Automatic reconnection on SSE drop
 */

import { useState, useEffect, useCallback, useRef } from "react";
import {
  desktopStaticApiError,
  isDesktopStaticRuntime,
  logRuntime,
  toErrorMessage,
} from "../utils/diagnostics";

export interface NoteData {
  id: string;
  title: string;
  content: string;
  workspaceId: string;
  metadata: {
    type: "spec" | "task" | "general";
    taskStatus?: string;
    assignedAgentIds?: string[];
    parentNoteId?: string;
    linkedTaskId?: string;
    custom?: Record<string, string>;
  };
  createdAt: string;
  updatedAt: string;
}

export interface UseNotesReturn {
  notes: NoteData[];
  loading: boolean;
  error: string | null;
  connected: boolean;
  /** Fetch all notes for the workspace */
  fetchNotes: () => Promise<void>;
  /** Fetch a single note by ID */
  fetchNote: (noteId: string) => Promise<NoteData | null>;
  /** Create a new note */
  createNote: (params: {
    noteId?: string;
    title: string;
    content?: string;
    type?: "spec" | "task" | "general";
    metadata?: Record<string, unknown>;
  }) => Promise<NoteData | null>;
  /** Update an existing note */
  updateNote: (
    noteId: string,
    update: { title?: string; content?: string; metadata?: Record<string, unknown> }
  ) => Promise<NoteData | null>;
  /** Delete a note */
  deleteNote: (noteId: string) => Promise<void>;
}

export function useNotes(workspaceId: string = "default"): UseNotesReturn {
  const [notes, setNotes] = useState<NoteData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Fetch Notes ──────────────────────────────────────────────────

  const fetchNotes = useCallback(async () => {
    if (isDesktopStaticRuntime()) {
      setError(desktopStaticApiError("Notes").message);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/notes?workspaceId=${encodeURIComponent(workspaceId)}`);
      if (!res.ok) throw new Error(`Failed to fetch notes: ${res.status}`);
      const data = await res.json();
      setNotes(data.notes ?? []);
    } catch (err) {
      logRuntime("warn", "useNotes.fetchNotes", "Failed to fetch notes", err);
      setError(toErrorMessage(err) || "Failed to fetch notes");
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  const fetchNote = useCallback(
    async (noteId: string): Promise<NoteData | null> => {
      if (isDesktopStaticRuntime()) {
        setError(desktopStaticApiError("Notes").message);
        return null;
      }
      try {
        const res = await fetch(
          `/api/notes?workspaceId=${encodeURIComponent(workspaceId)}&noteId=${encodeURIComponent(noteId)}`
        );
        if (!res.ok) return null;
        const data = await res.json();
        return data.note ?? null;
      } catch {
        return null;
      }
    },
    [workspaceId]
  );

  // ─── CRUD Operations ──────────────────────────────────────────────

  const createNote = useCallback(
    async (params: {
      noteId?: string;
      title: string;
      content?: string;
      type?: "spec" | "task" | "general";
      metadata?: Record<string, unknown>;
    }): Promise<NoteData | null> => {
      if (isDesktopStaticRuntime()) {
        setError(desktopStaticApiError("Notes").message);
        return null;
      }
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...params, workspaceId, source: "user" }),
        });
        if (!res.ok) throw new Error(`Failed to create note: ${res.status}`);
        const data = await res.json();
        return data.note ?? null;
      } catch (err) {
        logRuntime("warn", "useNotes.createNote", "Failed to create note", err);
        setError(toErrorMessage(err) || "Failed to create note");
        return null;
      }
    },
    [workspaceId]
  );

  const updateNote = useCallback(
    async (
      noteId: string,
      update: { title?: string; content?: string; metadata?: Record<string, unknown> }
    ): Promise<NoteData | null> => {
      if (isDesktopStaticRuntime()) {
        setError(desktopStaticApiError("Notes").message);
        return null;
      }
      try {
        const res = await fetch("/api/notes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ noteId, ...update, workspaceId, source: "user" }),
        });
        if (!res.ok) throw new Error(`Failed to update note: ${res.status}`);
        const data = await res.json();
        return data.note ?? null;
      } catch (err) {
        logRuntime("warn", "useNotes.updateNote", "Failed to update note", err);
        setError(toErrorMessage(err) || "Failed to update note");
        return null;
      }
    },
    [workspaceId]
  );

  const deleteNote = useCallback(
    async (noteId: string): Promise<void> => {
      if (isDesktopStaticRuntime()) {
        setError(desktopStaticApiError("Notes").message);
        return;
      }
      try {
        const res = await fetch(
          `/api/notes?noteId=${encodeURIComponent(noteId)}&workspaceId=${encodeURIComponent(workspaceId)}`,
          { method: "DELETE" }
        );
        if (!res.ok) throw new Error(`Failed to delete note: ${res.status}`);
      } catch (err) {
        logRuntime("warn", "useNotes.deleteNote", "Failed to delete note", err);
        setError(toErrorMessage(err) || "Failed to delete note");
      }
    },
    [workspaceId]
  );

  // ─── SSE Subscription ────────────────────────────────────────────

  const connectSSE = useCallback(() => {
    if (isDesktopStaticRuntime()) {
      setConnected(false);
      setError(desktopStaticApiError("Notes SSE").message);
      return;
    }
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource(
      `/api/notes/events?workspaceId=${encodeURIComponent(workspaceId)}`
    );
    eventSourceRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "connected") {
          setConnected(true);
          return;
        }

        if (data.type === "note:created" && data.note) {
          setNotes((prev) => {
            // Avoid duplicates
            if (prev.some((n) => n.id === data.note.id)) {
              return prev.map((n) => (n.id === data.note.id ? data.note : n));
            }
            return [...prev, data.note];
          });
        }

        if (data.type === "note:updated" && data.note) {
          setNotes((prev) =>
            prev.map((n) => (n.id === data.note.id ? data.note : n))
          );
        }

        if (data.type === "note:deleted") {
          setNotes((prev) => prev.filter((n) => n.id !== data.noteId));
        }
      } catch {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      logRuntime("warn", "useNotes.connectSSE", "SSE connection error");
      setConnected(false);
      es.close();
      eventSourceRef.current = null;

      // Reconnect after 3s
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => connectSSE(), 3000);
    };
  }, [workspaceId]);

  // Connect SSE and fetch initial notes
  useEffect(() => {
    fetchNotes();
    connectSSE();

    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
    };
  }, [fetchNotes, connectSSE]);

  return {
    notes,
    loading,
    error,
    connected,
    fetchNotes,
    fetchNote,
    createNote,
    updateNote,
    deleteNote,
  };
}
