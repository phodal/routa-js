"use client";

import { useCallback, useEffect, useRef } from "react";
import { getDesktopApiBaseUrl } from "../utils/diagnostics";

interface UseKanbanEventsOptions {
  workspaceId: string;
  onInvalidate: () => void;
}

export function useKanbanEvents({ workspaceId, onInvalidate }: UseKanbanEventsOptions): void {
  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tearingDownRef = useRef(false);
  const onInvalidateRef = useRef(onInvalidate);
  const connectSseRef = useRef<() => void>(() => {});

  useEffect(() => {
    onInvalidateRef.current = onInvalidate;
  }, [onInvalidate]);

  const connectSSE = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const base = getDesktopApiBaseUrl();
    const es = new EventSource(
      `${base}/api/kanban/events?workspaceId=${encodeURIComponent(workspaceId)}`
    );
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as { type?: string };
        if (data.type === "connected" || data.type === "kanban:changed") {
          onInvalidateRef.current();
        }
      } catch {
        // Ignore malformed payloads.
      }
    };

    es.onerror = () => {
      if (tearingDownRef.current || document.visibilityState === "hidden") {
        es.close();
        eventSourceRef.current = null;
        return;
      }
      es.close();
      eventSourceRef.current = null;
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = setTimeout(() => connectSseRef.current(), 3000);
    };
  }, [workspaceId]);

  useEffect(() => {
    connectSseRef.current = connectSSE;
  }, [connectSSE]);

  useEffect(() => {
    if (workspaceId === "__placeholder__") return;

    tearingDownRef.current = false;
    connectSSE();

    return () => {
      tearingDownRef.current = true;
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
    };
  }, [connectSSE, workspaceId]);
}
