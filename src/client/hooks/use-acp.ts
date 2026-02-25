"use client";

/**
 * useAcp - React hook for ACP client connection
 *
 * Manages BrowserAcpClient lifecycle and provides React state for:
 *   - Connection status
 *   - Session management (create, select)
 *   - Prompt sending
 *   - SSE update stream
 */

import { useState, useCallback, useRef, useEffect } from "react";
import {
  BrowserAcpClient,
  AcpSessionNotification,
  AcpNewSessionResult,
  AcpProviderInfo,
  AcpClientError,
  AcpAuthMethod,
} from "../acp-client";
import {
  desktopStaticApiError,
  isDesktopStaticRuntime,
  logRuntime,
  toErrorMessage,
} from "../utils/diagnostics";

/**
 * Authentication error info for display in UI.
 */
export interface AuthErrorInfo {
  message: string;
  authMethods: AcpAuthMethod[];
  agentInfo?: { name: string; version: string };
}

export interface UseAcpState {
  connected: boolean;
  sessionId: string | null;
  updates: AcpSessionNotification[];
  providers: AcpProviderInfo[];
  selectedProvider: string;
  loading: boolean;
  error: string | null;
  /** Authentication error with methods to authenticate */
  authError: AuthErrorInfo | null;
}

export interface UseAcpActions {
  connect: () => Promise<void>;
  createSession: (
    cwd?: string,
    provider?: string,
    modeId?: string,
    role?: string,
    workspaceId?: string,
    model?: string,
  ) => Promise<AcpNewSessionResult | null>;
  selectSession: (sessionId: string) => void;
  setProvider: (provider: string) => void;
  setMode: (modeId: string) => Promise<void>;
  prompt: (text: string) => Promise<void>;
  cancel: () => Promise<void>;
  disconnect: () => void;
  /** Clear auth error (e.g., when user dismisses the popup) */
  clearAuthError: () => void;
  /** List models available for a provider (e.g. opencode) */
  listProviderModels: (provider: string) => Promise<string[]>;
}

export function useAcp(baseUrl: string = ""): UseAcpState & UseAcpActions {
  const clientRef = useRef<BrowserAcpClient | null>(null);
  const sessionIdRef = useRef<string | null>(null);

  const [state, setState] = useState<UseAcpState>({
    connected: false,
    sessionId: null,
    updates: [],
    providers: [],
    selectedProvider: "opencode",
    loading: false,
    error: null,
    authError: null,
  });

  // Clean up on unmount
  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
    };
  }, []);

  /** Connect (initialize only). Session creation is explicit. */
  const connect = useCallback(async () => {
    try {
      if (isDesktopStaticRuntime()) {
        throw desktopStaticApiError("ACP");
      }
      setState((s) => ({ ...s, loading: true, error: null }));

      const client = new BrowserAcpClient(baseUrl);

      await client.initialize();
      
      // Fast path: Load providers without checking (instant)
      const fastProviders = await client.listProviders(false);
      
      client.onUpdate((update) => {
        setState((s) => ({
          ...s,
          updates: [...s.updates, update],
        }));
      });

      clientRef.current = client;

      setState((s) => ({
        ...s,
        connected: true,
        providers: fastProviders,
        loading: false,
      }));

      // Background: Check provider status and update
      client.listProviders(true).then((checkedProviders) => {
        setState((s) => ({
          ...s,
          providers: checkedProviders,
        }));
      }).catch((err) => {
        logRuntime("warn", "useAcp.connect", "Failed to check provider status", err);
      });
    } catch (err) {
      logRuntime("error", "useAcp.connect", "Failed to connect ACP client", err);
      setState((s) => ({
        ...s,
        loading: false,
        error: toErrorMessage(err) || "Connection failed",
      }));
    }
  }, [baseUrl]);

  /** Clear auth error (e.g., when user dismisses the popup) */
  const clearAuthError = useCallback(() => {
    setState((s) => ({ ...s, authError: null }));
  }, []);

  const createSession = useCallback(
    async (
      cwd?: string,
      provider?: string,
      modeId?: string,
      role?: string,
      workspaceId?: string,
      model?: string,
    ): Promise<AcpNewSessionResult | null> => {
      const client = clientRef.current;
      if (!client) return null;
      try {
        if (isDesktopStaticRuntime()) {
          throw desktopStaticApiError("ACP");
        }
        setState((s) => ({ ...s, loading: true, error: null, authError: null, updates: [] }));
        const activeProvider = provider ?? state.selectedProvider;
        const result = await client.newSession({
          cwd,
          provider: activeProvider,
          modeId,
          role,
          mcpServers: [],
          workspaceId,
          model,
        });
        sessionIdRef.current = result.sessionId;
        setState((s) => ({
          ...s,
          sessionId: result.sessionId,
          selectedProvider: result.provider ?? activeProvider,
          loading: false,
        }));
        return result;
      } catch (err) {
        logRuntime("error", "useAcp.createSession", "Failed to create ACP session", err);

        // Check if this is an auth error with authMethods
        if (err instanceof AcpClientError && err.authMethods && err.authMethods.length > 0) {
          setState((s) => ({
            ...s,
            loading: false,
            error: null,
            authError: {
              message: err.message,
              authMethods: err.authMethods!,
              agentInfo: err.agentInfo,
            },
          }));
          return null;
        }

        setState((s) => ({
          ...s,
          loading: false,
          error: toErrorMessage(err) || "Session creation failed",
        }));
        return null;
      }
    },
    [state.selectedProvider]
  );

  const setProvider = useCallback((provider: string) => {
    setState((s) => ({ ...s, selectedProvider: provider }));
  }, []);

  const setMode = useCallback(async (modeId: string): Promise<void> => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId || !modeId) return;

    try {
      await client.setMode(sessionId, modeId);
    } catch (err) {
      logRuntime("warn", "useAcp.setMode", "Failed to set mode", err);
      setState((s) => ({
        ...s,
        error: toErrorMessage(err) || "Failed to set mode",
      }));
    }
  }, []);

  const selectSession = useCallback((sessionId: string) => {
    const client = clientRef.current;
    if (!client) return;
    sessionIdRef.current = sessionId;
    client.attachSession(sessionId);
    setState((s) => ({ ...s, sessionId, updates: [] }));
  }, []);

  /** Send a prompt to current session (content streams over SSE). */
  const prompt = useCallback(async (text: string): Promise<void> => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;

    try {
      setState((s) => ({ ...s, loading: true, error: null }));
      await client.prompt(sessionId, text);
      setState((s) => ({ ...s, loading: false }));
    } catch (err) {
      logRuntime("error", "useAcp.prompt", "Failed to send prompt", err);
      setState((s) => ({
        ...s,
        loading: false,
        error: toErrorMessage(err) || "Prompt failed",
      }));
    }
  }, []);

  const cancel = useCallback(async () => {
    const client = clientRef.current;
    const sessionId = sessionIdRef.current;
    if (!client || !sessionId) return;
    await client.cancel(sessionId);
  }, []);

  const disconnect = useCallback(() => {
    clientRef.current?.disconnect();
    clientRef.current = null;
    sessionIdRef.current = null;
    setState({
      connected: false,
      sessionId: null,
      updates: [],
      providers: [],
      selectedProvider: "opencode",
      loading: false,
      error: null,
      authError: null,
    });
  }, []);

  const listProviderModels = useCallback(async (provider: string): Promise<string[]> => {
    const client = clientRef.current;
    if (!client) return [];
    try {
      return await client.listProviderModels(provider);
    } catch {
      return [];
    }
  }, []);

  return {
    ...state,
    connect,
    createSession,
    selectSession,
    setProvider,
    setMode,
    prompt,
    cancel,
    disconnect,
    clearAuthError,
    listProviderModels,
  };
}
