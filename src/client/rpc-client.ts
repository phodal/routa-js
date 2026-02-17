/**
 * RoutaRpcClient — JSON-RPC 2.0 client for Routa.js
 *
 * Transport-aware: uses Tauri IPC (`rpc_call`) when available (bypasses HTTP),
 * otherwise falls back to `POST /api/rpc` over HTTP.
 *
 * Usage:
 * ```ts
 * import { rpc } from "@/client/rpc-client";
 *
 * const { agents } = await rpc.call("agents.list", { workspaceId: "default" });
 * const agent = await rpc.call("agents.get", { id: "abc" });
 * ```
 */

import { isTauriRuntime } from "./utils/diagnostics";
import { resolveApiPath } from "./config/backend";

// ---------------------------------------------------------------------------
// JSON-RPC 2.0 types
// ---------------------------------------------------------------------------

export interface JsonRpcRequest {
  jsonrpc: "2.0";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: unknown;
}

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: number | string | null;
  result?: unknown;
  error?: JsonRpcError;
}

// ---------------------------------------------------------------------------
// Error class
// ---------------------------------------------------------------------------

export class RpcError extends Error {
  code: number;
  data?: unknown;

  constructor(code: number, message: string, data?: unknown) {
    super(message);
    this.name = "RpcError";
    this.code = code;
    this.data = data;
  }
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

let _idCounter = 0;

function nextId(): number {
  return ++_idCounter;
}

async function tauriInvoke(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const invoke = (window as any).__TAURI__?.core?.invoke;
  if (!invoke) {
    throw new Error("Tauri invoke not available");
  }
  return invoke("rpc_call", { request }) as Promise<JsonRpcResponse>;
}

async function httpPost(
  request: JsonRpcRequest,
  baseUrl?: string,
): Promise<JsonRpcResponse> {
  const url = resolveApiPath("/api/rpc", baseUrl);
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    throw new RpcError(-32603, `HTTP ${res.status}: ${res.statusText}`);
  }
  return res.json();
}

export class RoutaRpcClient {
  private baseUrl?: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl;
  }

  /**
   * Call a JSON-RPC method.
   *
   * In Tauri desktop mode this goes through IPC directly to the Rust
   * RpcRouter (no HTTP). In browser/web mode it falls back to
   * `POST /api/rpc`.
   */
  async call<T = unknown>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<T> {
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      id: nextId(),
      method,
      params,
    };

    let response: JsonRpcResponse;
    try {
      if (isTauriRuntime()) {
        response = await tauriInvoke(request);
      } else {
        response = await httpPost(request, this.baseUrl);
      }
    } catch (err) {
      if (err instanceof RpcError) throw err;
      throw new RpcError(
        -32603,
        err instanceof Error ? err.message : String(err),
      );
    }

    if (response.error) {
      throw new RpcError(
        response.error.code,
        response.error.message,
        response.error.data,
      );
    }

    return response.result as T;
  }
}

/** Default singleton client (no explicit baseUrl). */
export const rpc = new RoutaRpcClient();
