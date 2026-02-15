/**
 * WebSocket Server Transport for MCP
 *
 * Implements the MCP Transport interface over a WebSocket connection.
 * Each WebSocket connection creates a new transport instance,
 * which is then connected to its own MCP Server.
 *
 * This is the TypeScript equivalent of the Kotlin SDK's mcpWebSocket() extension.
 *
 * Messages are JSON-RPC over WebSocket text frames:
 *   Client → Server: JSON-RPC requests/notifications
 *   Server → Client: JSON-RPC responses/notifications
 */

import type { WebSocket } from "ws";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

export class WebSocketServerTransport implements Transport {
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (message: JSONRPCMessage) => void;

  private _started = false;

  constructor(private readonly ws: WebSocket) {}

  /**
   * Start the transport - wires up WebSocket event handlers.
   * Called automatically by Server.connect().
   */
  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    this.ws.on("message", (data: Buffer | string) => {
      try {
        const text = typeof data === "string" ? data : data.toString("utf-8");
        const message = JSON.parse(text) as JSONRPCMessage;
        this.onmessage?.(message);
      } catch (err) {
        this.onerror?.(
          err instanceof Error ? err : new Error(String(err))
        );
      }
    });

    this.ws.on("close", () => {
      this.onclose?.();
    });

    this.ws.on("error", (err: Error) => {
      this.onerror?.(err);
    });
  }

  /**
   * Send a JSON-RPC message to the client over the WebSocket.
   */
  async send(message: JSONRPCMessage): Promise<void> {
    if (this.ws.readyState !== this.ws.OPEN) {
      throw new Error("WebSocket is not open");
    }

    return new Promise((resolve, reject) => {
      this.ws.send(JSON.stringify(message), (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }

  /**
   * Close the WebSocket connection.
   */
  async close(): Promise<void> {
    this.ws.close();
  }
}
