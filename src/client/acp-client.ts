/**
 * Browser ACP Client
 *
 * Connects to `/api/acp` via JSON-RPC over HTTP and receives `session/update`
 * notifications via SSE.
 *
 * The backend spawns an opencode process per session and proxies:
 *   - JSON-RPC requests → opencode stdin
 *   - opencode stdout → SSE session/update
 */

export interface AcpSessionNotification {
  sessionId: string;
  update?: Record<string, unknown>;
  /** Flat fields from opencode (sessionUpdate, content, etc.) */
  [key: string]: unknown;
}

export interface AcpInitializeResult {
  protocolVersion: string | number;
  agentCapabilities: Record<string, unknown>;
  agentInfo?: { name: string; version: string };
}

export interface AcpNewSessionResult {
  sessionId: string;
  provider?: string;
  role?: string;
  routaAgentId?: string;
}

export interface AcpPromptResult {
  stopReason: string;
  /** Full response content (for serverless environments where SSE may not work) */
  content?: string;
  /** Token usage info */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface AcpProviderInfo {
  id: string;
  name: string;
  description: string;
  command: string;
  status?: "available" | "unavailable" | "checking";
  source?: "static" | "registry";
}

export type SessionUpdateHandler = (update: AcpSessionNotification) => void;

/**
 * Authentication method info from ACP agent.
 */
export interface AcpAuthMethod {
  id: string;
  name: string;
  description: string;
}

/**
 * Custom error class for ACP errors that may include auth requirements.
 */
export class AcpClientError extends Error {
  code: number;
  authMethods?: AcpAuthMethod[];
  agentInfo?: { name: string; version: string };

  constructor(
    message: string,
    code: number,
    authMethods?: AcpAuthMethod[],
    agentInfo?: { name: string; version: string }
  ) {
    super(message);
    this.name = "AcpClientError";
    this.code = code;
    this.authMethods = authMethods;
    this.agentInfo = agentInfo;
  }
}

export class BrowserAcpClient {
  private baseUrl: string;
  private eventSource: EventSource | null = null;
  private updateHandlers: SessionUpdateHandler[] = [];
  private requestId = 0;
  private _sessionId: string | null = null;

  constructor(baseUrl: string = "") {
    this.baseUrl = baseUrl;
  }

  get sessionId(): string | null {
    return this._sessionId;
  }

  /**
   * Initialize the ACP connection.
   */
  async initialize(
    protocolVersion: number | string = 1
  ): Promise<AcpInitializeResult> {
    return this.rpc("initialize", { protocolVersion });
  }

  /**
   * Create a new ACP session.
   * This spawns a new ACP agent process on the backend.
   *
   * @param params.idempotencyKey - Optional unique key to prevent duplicate session creation.
   *   If provided, the backend will return the same session for repeated requests with the same key
   *   within a short time window (30 seconds). This prevents multiple sessions being created when
   *   user clicks "Start" multiple times before navigation completes.
   */
  async newSession(params: {
    cwd?: string;
    provider?: string;
    modeId?: string;
    role?: string;
    crafterProvider?: string;
    gateProvider?: string;
    mcpServers?: Array<{ name: string; url?: string }>;
    workspaceId?: string;
    model?: string;
    idempotencyKey?: string;
  }): Promise<AcpNewSessionResult> {
    const result = await this.rpc<AcpNewSessionResult>("session/new", {
      cwd: params.cwd,
      provider: params.provider ?? "opencode",
      modeId: params.modeId,
      role: params.role,
      crafterProvider: params.crafterProvider,
      gateProvider: params.gateProvider,
      mcpServers: params.mcpServers ?? [],
      workspaceId: params.workspaceId,
      model: params.model,
      idempotencyKey: params.idempotencyKey,
    });
    this._sessionId = result.sessionId;

    // Connect SSE after we know the sessionId
    this.attachSession(result.sessionId);

    return result;
  }

  /**
   * List available models for a provider (e.g. opencode).
   */
  async listProviderModels(provider: string): Promise<string[]> {
    const response = await fetch(`${this.baseUrl}/api/providers/models?provider=${encodeURIComponent(provider)}`);
    const data = await response.json();
    return Array.isArray(data.models) ? data.models : [];
  }

  /**
   * List available ACP providers from the backend.
   * @param check - If true, check command availability (slower). If false, return immediately with "checking" status.
   * @param includeRegistry - If true, include registry providers (slower). If false, only local providers.
   */
  async listProviders(check: boolean = false, includeRegistry: boolean = false): Promise<AcpProviderInfo[]> {
    const params = new URLSearchParams();
    if (check) params.set("check", "true");
    if (includeRegistry) params.set("registry", "true");

    const response = await fetch(`${this.baseUrl}/api/providers?${params}`);
    const data = await response.json();

    return Array.isArray(data.providers) ? data.providers : [];
  }

  /**
   * Load registry providers asynchronously after local providers are loaded.
   * This is useful for showing local providers first, then loading registry in background.
   */
  async loadRegistryProviders(): Promise<AcpProviderInfo[]> {
    const response = await fetch(`${this.baseUrl}/api/providers?registry=true`);
    const data = await response.json();
    return Array.isArray(data.providers) ? data.providers : [];
  }

  /**
   * Attach to an existing session ID (switch sessions).
   */
  attachSession(sessionId: string): void {
    this._sessionId = sessionId;
    this.connectSSE(sessionId);
  }

  /**
   * Send a prompt to the session.
   * Content streams via SSE session/update notifications.
   * In serverless environments, content may also be returned in the response.
   */
  async prompt(sessionId: string, text: string): Promise<AcpPromptResult> {
    const result = await this.rpc<AcpPromptResult>("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text }],
    });

    // In serverless environments, SSE might not work across lambda instances.
    // If the response includes content directly, emit it as an update notification.
    if (result.content) {
      const notification: AcpSessionNotification = {
        sessionId,
        update: {
          sessionUpdate: "agent_message_chunk",
          content: {
            type: "text",
            text: result.content,
          },
        },
      };

      for (const handler of this.updateHandlers) {
        try {
          handler(notification);
        } catch (err) {
          console.error("[AcpClient] Handler error:", err);
        }
      }

      // Also emit turn_complete
      const turnCompleteNotification: AcpSessionNotification = {
        sessionId,
        update: {
          sessionUpdate: "turn_complete",
          stopReason: result.stopReason,
          usage: result.usage ? {
            input_tokens: result.usage.inputTokens,
            output_tokens: result.usage.outputTokens,
          } : undefined,
        },
      };

      for (const handler of this.updateHandlers) {
        try {
          handler(turnCompleteNotification);
        } catch (err) {
          console.error("[AcpClient] Handler error:", err);
        }
      }
    }

    return result;
  }

  /**
   * Set session mode (if provider supports it).
   */
  async setMode(sessionId: string, modeId: string): Promise<void> {
    await this.rpc("session/set_mode", { sessionId, modeId });
  }

  /**
   * Cancel the current prompt.
   */
  async cancel(sessionId: string): Promise<void> {
    await this.rpc("session/cancel", { sessionId });
  }

  /**
   * Register a handler for session updates (SSE).
   */
  onUpdate(handler: SessionUpdateHandler): () => void {
    this.updateHandlers.push(handler);
    return () => {
      this.updateHandlers = this.updateHandlers.filter((h) => h !== handler);
    };
  }

  /**
   * Disconnect and clean up.
   */
  disconnect(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._sessionId = null;
    this.updateHandlers = [];
  }

  // ─── Private ─────────────────────────────────────────────────────────

  private connectSSE(sessionId: string): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    this.eventSource = new EventSource(
      `${this.baseUrl}/api/acp?sessionId=${sessionId}`
    );

    this.eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.method === "session/update" && data.params) {
          const notification = data.params as AcpSessionNotification;

          for (const handler of this.updateHandlers) {
            try {
              handler(notification);
            } catch (err) {
              console.error("[AcpClient] Handler error:", err);
            }
          }
        }
      } catch (err) {
        console.error("[AcpClient] SSE parse error:", err);
      }
    };

    this.eventSource.onerror = () => {
      // SSE will auto-reconnect
    };
  }

  private async rpc<T = unknown>(
    method: string,
    params: Record<string, unknown>
  ): Promise<T> {
    const id = ++this.requestId;

    const response = await fetch(`${this.baseUrl}/api/acp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id,
        method,
        params,
      }),
    });

    const data = await response.json();

    if (data.error) {
      // Throw AcpClientError with auth info if available
      throw new AcpClientError(
        data.error.message,
        data.error.code,
        data.error.authMethods,
        data.error.agentInfo
      );
    }

    return data.result as T;
  }
}
