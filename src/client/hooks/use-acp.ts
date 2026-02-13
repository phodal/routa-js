"use client";

/**
 * useAcp - React hook for ACP client connection
 *
 * FIX: Uses refs for sessionId to avoid stale closure bugs.
 * FIX: Processes inline messages from prompt response (not just SSE).
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { BrowserAcpClient, AcpSessionUpdate } from "../acp-client";

export interface AcpMessage {
  role: string;
  content: string;
  toolName?: string;
  toolCallId?: string;
  toolStatus?: string;
  toolResult?: unknown;
}

export interface UseAcpState {
  connected: boolean;
  sessionId: string | null;
  agentId: string | null;
  updates: AcpSessionUpdate[];
  loading: boolean;
  error: string | null;
}

export interface UseAcpActions {
  connect: () => Promise<void>;
  prompt: (text: string) => Promise<AcpMessage[]>;
  cancel: () => Promise<void>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  disconnect: () => void;
}

export function useAcp(baseUrl: string = ""): UseAcpState & UseAcpActions {
  const clientRef = useRef<BrowserAcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [state, setState] = useState<UseAcpState>({
    connected: false,
    sessionId: null,
    agentId: null,
    updates: [],
    loading: false,
    error: null,
  });

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  /**
   * Connect: initialize + create session + connect SSE
   * Does everything in one step so "Connect" button works end-to-end.
   */
  const connect = useCallback(async () => {
    try {
      setState((s) => ({ ...s, loading: true, error: null }));

      const client = new BrowserAcpClient(baseUrl);

      // 1. Initialize
      await client.initialize();

      // 2. Register SSE handler
      client.onUpdate((update) => {
        setState((s) => ({
          ...s,
          updates: [...s.updates, update],
        }));
      });

      clientRef.current = client;

      // 3. Create session
      const result = await client.newSession({});
      const sessionId = result.sessionId;
      const agentId = (result as unknown as Record<string, unknown>).agentId as
        | string
        | undefined;

      sessionIdRef.current = sessionId;

      setState((s) => ({
        ...s,
        connected: true,
        sessionId,
        agentId: agentId ?? null,
        loading: false,
        updates: [],
      }));
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Connection failed",
      }));
    }
  }, [baseUrl]);

  /**
   * Send a prompt. Returns inline messages from the JSON-RPC response.
   * Uses ref for sessionId to avoid stale closure.
   */
  const prompt = useCallback(async (text: string): Promise<AcpMessage[]> => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return [];

    try {
      setState((s) => ({ ...s, loading: true, error: null }));
      const result = await client.prompt(sessionId, text);
      setState((s) => ({ ...s, loading: false }));

      // Return inline messages from the response
      return (result.messages ?? []) as AcpMessage[];
    } catch (err) {
      setState((s) => ({
        ...s,
        loading: false,
        error: err instanceof Error ? err.message : "Prompt failed",
      }));
      return [];
    }
  }, []);

  const cancel = useCallback(async () => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    await client.cancel(sessionId);
  }, []);

  const callTool = useCallback(
    async (name: string, args: Record<string, unknown>) => {
      const client = clientRef.current;
      if (!client) throw new Error("Not connected");
      return client.callTool(name, args);
    },
    []
  );

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    sessionIdRef.current = null;
    setState({
      connected: false,
      sessionId: null,
      agentId: null,
      updates: [],
      loading: false,
      error: null,
    });
  }, []);

  return {
    ...state,
    connect,
    prompt,
    cancel,
    callTool,
    disconnect,
  };
}
