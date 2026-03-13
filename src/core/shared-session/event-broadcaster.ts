import type { SharedSessionEvent } from "./types";

type Controller = ReadableStreamDefaultController<Uint8Array>;
type EventHandler = (event: SharedSessionEvent) => void;

export class SharedSessionEventBroadcaster {
  private controllers = new Map<string, { controller: Controller; sharedSessionId: string }>();
  private subscribers = new Map<string, Set<EventHandler>>();
  private connectionCounter = 0;

  attach(sharedSessionId: string, controller: Controller): string {
    const connectionId = `shared-session-sse-${++this.connectionCounter}`;
    this.controllers.set(connectionId, { controller, sharedSessionId });

    this.writeSse(controller, {
      type: "connected",
      sharedSessionId,
      connectionId,
      timestamp: new Date().toISOString(),
    });

    return connectionId;
  }

  detach(connectionId: string): void {
    this.controllers.delete(connectionId);
  }

  subscribe(sharedSessionId: string, handler: EventHandler): () => void {
    let handlers = this.subscribers.get(sharedSessionId);
    if (!handlers) {
      handlers = new Set<EventHandler>();
      this.subscribers.set(sharedSessionId, handlers);
    }
    handlers.add(handler);

    return () => {
      const current = this.subscribers.get(sharedSessionId);
      if (!current) return;
      current.delete(handler);
      if (current.size === 0) {
        this.subscribers.delete(sharedSessionId);
      }
    };
  }

  broadcast(event: SharedSessionEvent): void {
    for (const [connectionId, { controller, sharedSessionId }] of this.controllers.entries()) {
      if (sharedSessionId !== event.sharedSessionId && sharedSessionId !== "*") continue;
      try {
        this.writeSse(controller, event);
      } catch {
        this.controllers.delete(connectionId);
      }
    }

    const handlers = this.subscribers.get(event.sharedSessionId);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch {
          // Subscriber errors must not break fan-out.
        }
      }
    }
  }

  private writeSse(controller: Controller, payload: unknown): void {
    const encoder = new TextEncoder();
    controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
  }
}

const GLOBAL_KEY = "__shared_session_event_broadcaster__";

export function getSharedSessionEventBroadcaster(): SharedSessionEventBroadcaster {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = new SharedSessionEventBroadcaster();
  }
  return g[GLOBAL_KEY] as SharedSessionEventBroadcaster;
}

