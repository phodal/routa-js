import { randomBytes } from "crypto";
import { v4 as uuidv4 } from "uuid";
import { SharedSessionEventBroadcaster } from "./event-broadcaster";
import type {
  DispatchSharedPromptInput,
  SharedPromptApproval,
  SharedPromptDispatcher,
  SharedPromptStatus,
  SharedSession,
  SharedSessionEvent,
  SharedSessionMessage,
  SharedSessionMode,
  SharedSessionParticipant,
  SharedSessionRole,
  SharedSessionStatus,
} from "./types";

interface HostSessionRecord {
  sessionId: string;
  workspaceId: string;
}

type HostSessionNotification = Record<string, unknown>;
type HostSessionNotificationHandler = (notification: HostSessionNotification) => void;

export interface SharedSessionNotificationHub {
  getSession(sessionId: string): HostSessionRecord | undefined;
  addNotificationInterceptor(sessionId: string, handler: HostSessionNotificationHandler): void;
  removeNotificationInterceptor(sessionId: string, handler: HostSessionNotificationHandler): void;
}

interface SharedSessionInterceptor {
  hostSessionId: string;
  handler: HostSessionNotificationHandler;
}

interface CreateSharedSessionInput {
  hostSessionId: string;
  hostUserId: string;
  hostDisplayName?: string;
  mode?: SharedSessionMode;
  workspaceId?: string;
  expiresAt?: Date;
}

interface JoinSharedSessionInput {
  sharedSessionId: string;
  inviteToken: string;
  userId: string;
  displayName?: string;
  role?: Exclude<SharedSessionRole, "host">;
}

interface AuthParticipantInput {
  sharedSessionId: string;
  participantId: string;
  participantToken: string;
}

interface SendMessageInput extends AuthParticipantInput {
  text: string;
}

interface SendPromptInput extends AuthParticipantInput {
  prompt: string;
}

interface RespondApprovalInput extends AuthParticipantInput {
  approvalId: string;
  action: "approve" | "reject";
}

type CloseSharedSessionInput = AuthParticipantInput;

interface ListSessionFilter {
  workspaceId?: string;
  hostSessionId?: string;
  status?: SharedSessionStatus;
}

export class SharedSessionError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export class SharedSessionService {
  private sessions = new Map<string, SharedSession>();
  private participants = new Map<string, SharedSessionParticipant>();
  private participantsBySession = new Map<string, Set<string>>();
  private approvals = new Map<string, SharedPromptApproval>();
  private approvalsBySession = new Map<string, Set<string>>();
  private messagesBySession = new Map<string, SharedSessionMessage[]>();
  private hostInterceptors = new Map<string, SharedSessionInterceptor>();

  constructor(
    private readonly sessionHub: SharedSessionNotificationHub,
    private readonly promptDispatcher: SharedPromptDispatcher,
    private readonly broadcaster: SharedSessionEventBroadcaster,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getBroadcaster(): SharedSessionEventBroadcaster {
    return this.broadcaster;
  }

  listSessions(filter?: ListSessionFilter): SharedSession[] {
    this.expireSessions();

    return Array.from(this.sessions.values())
      .filter((session) => {
        if (filter?.workspaceId && session.workspaceId !== filter.workspaceId) return false;
        if (filter?.hostSessionId && session.hostSessionId !== filter.hostSessionId) return false;
        if (filter?.status && session.status !== filter.status) return false;
        return true;
      })
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((session) => this.cloneSession(session));
  }

  createSession(input: CreateSharedSessionInput): {
    session: SharedSession;
    hostParticipant: SharedSessionParticipant;
  } {
    this.expireSessions();

    const hostSession = this.sessionHub.getSession(input.hostSessionId);
    if (!hostSession) {
      throw new SharedSessionError(
        "HOST_SESSION_NOT_FOUND",
        `Host session not found: ${input.hostSessionId}`,
        404,
      );
    }

    const sessionId = uuidv4();
    const mode = input.mode ?? "prompt_with_approval";
    const session: SharedSession = {
      id: sessionId,
      workspaceId: input.workspaceId ?? hostSession.workspaceId ?? "default",
      hostUserId: input.hostUserId.trim(),
      hostSessionId: input.hostSessionId,
      mode,
      approvalRequired: mode === "prompt_with_approval",
      inviteToken: this.generateToken(),
      createdAt: this.now(),
      expiresAt: input.expiresAt,
      status: "active",
    };

    this.sessions.set(session.id, session);

    const hostParticipant: SharedSessionParticipant = {
      id: uuidv4(),
      sharedSessionId: session.id,
      userId: input.hostUserId.trim(),
      displayName: input.hostDisplayName,
      role: "host",
      accessToken: this.generateToken(),
      joinedAt: this.now(),
    };
    this.insertParticipant(hostParticipant);

    this.registerHostSessionForwarder(session);

    this.emit({
      type: "shared_session_created",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        session: this.serializeSessionPayload(session),
      },
    });
    this.emit({
      type: "participant_joined",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        participant: this.serializeParticipantPayload(hostParticipant),
      },
    });

    return {
      session: this.cloneSession(session),
      hostParticipant: this.cloneParticipant(hostParticipant),
    };
  }

  getSession(sharedSessionId: string): SharedSession | undefined {
    const session = this.ensureSessionActive(sharedSessionId, false);
    return session ? this.cloneSession(session) : undefined;
  }

  listParticipants(sharedSessionId: string): SharedSessionParticipant[] {
    this.ensureSessionActive(sharedSessionId);
    const participantIds = this.participantsBySession.get(sharedSessionId);
    if (!participantIds) return [];
    return Array.from(participantIds)
      .map((id) => this.participants.get(id))
      .filter((p): p is SharedSessionParticipant => !!p)
      .map((participant) => this.cloneParticipant(participant));
  }

  listApprovals(sharedSessionId: string): SharedPromptApproval[] {
    this.ensureSessionActive(sharedSessionId);
    const approvalIds = this.approvalsBySession.get(sharedSessionId);
    if (!approvalIds) return [];
    return Array.from(approvalIds)
      .map((id) => this.approvals.get(id))
      .filter((approval): approval is SharedPromptApproval => !!approval)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((approval) => this.cloneApproval(approval));
  }

  listMessages(sharedSessionId: string): SharedSessionMessage[] {
    this.ensureSessionActive(sharedSessionId);
    const messages = this.messagesBySession.get(sharedSessionId) ?? [];
    return messages.map((msg) => this.cloneMessage(msg));
  }

  joinSession(input: JoinSharedSessionInput): {
    session: SharedSession;
    participant: SharedSessionParticipant;
  } {
    const session = this.ensureSessionActive(input.sharedSessionId);

    if (session.inviteToken !== input.inviteToken) {
      throw new SharedSessionError("INVALID_INVITE_TOKEN", "Invite token is invalid.", 403);
    }

    const existing = this.findActiveParticipantByUserId(input.sharedSessionId, input.userId);
    if (existing) {
      return {
        session: this.cloneSession(session),
        participant: this.cloneParticipant(existing),
      };
    }

    const participant: SharedSessionParticipant = {
      id: uuidv4(),
      sharedSessionId: session.id,
      userId: input.userId.trim(),
      displayName: input.displayName,
      role: input.role ?? "collaborator",
      accessToken: this.generateToken(),
      joinedAt: this.now(),
    };

    this.insertParticipant(participant);
    this.emit({
      type: "participant_joined",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        participant: this.serializeParticipantPayload(participant),
      },
    });

    return {
      session: this.cloneSession(session),
      participant: this.cloneParticipant(participant),
    };
  }

  leaveSession(input: AuthParticipantInput): SharedSessionParticipant {
    this.ensureSessionActive(input.sharedSessionId);
    const participant = this.authenticateParticipant(input);

    if (participant.leftAt) {
      return this.cloneParticipant(participant);
    }

    participant.leftAt = this.now();
    this.emit({
      type: "participant_left",
      sharedSessionId: participant.sharedSessionId,
      timestamp: this.now().toISOString(),
      payload: {
        participant: this.serializeParticipantPayload(participant),
      },
    });

    return this.cloneParticipant(participant);
  }

  closeSession(input: CloseSharedSessionInput): SharedSession {
    const session = this.ensureSessionActive(input.sharedSessionId);
    const participant = this.authenticateParticipant(input);
    if (participant.role !== "host") {
      throw new SharedSessionError("HOST_REQUIRED", "Only host can close the shared session.", 403);
    }

    this.finalizeSession(session.id, "closed");
    return this.cloneSession(session);
  }

  authenticateParticipant(input: AuthParticipantInput): SharedSessionParticipant {
    this.ensureSessionActive(input.sharedSessionId);

    const participant = this.participants.get(input.participantId);
    if (!participant || participant.sharedSessionId !== input.sharedSessionId) {
      throw new SharedSessionError("PARTICIPANT_NOT_FOUND", "Participant not found.", 404);
    }
    if (participant.accessToken !== input.participantToken) {
      throw new SharedSessionError("INVALID_PARTICIPANT_TOKEN", "Participant token is invalid.", 403);
    }
    if (participant.leftAt) {
      throw new SharedSessionError("PARTICIPANT_INACTIVE", "Participant has already left.", 409);
    }

    return participant;
  }

  sendMessage(input: SendMessageInput): SharedSessionMessage {
    const participant = this.authenticateParticipant(input);
    const session = this.ensureSessionActive(input.sharedSessionId);
    if (!this.canComment(session, participant.role)) {
      throw new SharedSessionError("COMMENT_NOT_ALLOWED", "Message sending is not allowed in current mode.", 403);
    }

    const text = input.text.trim();
    if (!text) {
      throw new SharedSessionError("EMPTY_MESSAGE", "Message text cannot be empty.");
    }

    const message: SharedSessionMessage = {
      id: uuidv4(),
      sharedSessionId: session.id,
      participantId: participant.id,
      authorUserId: participant.userId,
      kind: "comment",
      text,
      createdAt: this.now(),
    };

    this.appendMessage(message);
    this.emit({
      type: "message_created",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        message: this.serializeMessagePayload(message),
        participant: this.serializeParticipantPayload(participant),
      },
    });

    return this.cloneMessage(message);
  }

  sendPrompt(input: SendPromptInput): {
    status: SharedPromptStatus;
    approval?: SharedPromptApproval;
  } {
    const participant = this.authenticateParticipant(input);
    const session = this.ensureSessionActive(input.sharedSessionId);
    if (!this.canPrompt(session, participant.role)) {
      throw new SharedSessionError("PROMPT_NOT_ALLOWED", "Prompt sending is not allowed in current mode.", 403);
    }

    const prompt = input.prompt.trim();
    if (!prompt) {
      throw new SharedSessionError("EMPTY_PROMPT", "Prompt cannot be empty.");
    }

    if (session.mode === "prompt_with_approval" && participant.role !== "host") {
      const pendingApproval = this.createApproval({
        sharedSessionId: session.id,
        participantId: participant.id,
        prompt,
        status: "pending",
      });
      const pendingMessage: SharedSessionMessage = {
        id: uuidv4(),
        sharedSessionId: session.id,
        participantId: participant.id,
        authorUserId: participant.userId,
        kind: "prompt",
        text: prompt,
        approvalId: pendingApproval.id,
        createdAt: this.now(),
      };
      this.appendMessage(pendingMessage);

      this.emit({
        type: "prompt_pending_approval",
        sharedSessionId: session.id,
        timestamp: this.now().toISOString(),
        payload: {
          approval: this.serializeApprovalPayload(pendingApproval),
          participant: this.serializeParticipantPayload(participant),
        },
      });

      return {
        status: "pending",
        approval: this.cloneApproval(pendingApproval),
      };
    }

    const approved = this.createApproval({
      sharedSessionId: session.id,
      participantId: participant.id,
      prompt,
      status: "approved",
      resolvedAt: this.now(),
      resolvedByParticipantId: participant.id,
    });
    this.emit({
      type: "prompt_approved",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        approval: this.serializeApprovalPayload(approved),
        participant: this.serializeParticipantPayload(participant),
      },
    });
    this.dispatchPromptWithLifecycle(session, approved);

    return {
      status: approved.status,
      approval: this.cloneApproval(approved),
    };
  }

  respondToApproval(input: RespondApprovalInput): SharedPromptApproval {
    const participant = this.authenticateParticipant(input);
    if (participant.role !== "host") {
      throw new SharedSessionError("HOST_REQUIRED", "Only host can approve or reject prompts.", 403);
    }

    const session = this.ensureSessionActive(input.sharedSessionId);
    const approval = this.approvals.get(input.approvalId);
    if (!approval || approval.sharedSessionId !== session.id) {
      throw new SharedSessionError("APPROVAL_NOT_FOUND", "Approval request not found.", 404);
    }
    if (approval.status !== "pending") {
      throw new SharedSessionError("APPROVAL_ALREADY_RESOLVED", "Approval has already been resolved.", 409);
    }

    approval.resolvedAt = this.now();
    approval.resolvedByParticipantId = participant.id;

    if (input.action === "reject") {
      approval.status = "rejected";
      this.emit({
        type: "prompt_rejected",
        sharedSessionId: session.id,
        timestamp: this.now().toISOString(),
        payload: {
          approval: this.serializeApprovalPayload(approval),
          participant: this.serializeParticipantPayload(participant),
        },
      });
      return this.cloneApproval(approval);
    }

    approval.status = "approved";
    this.emit({
      type: "prompt_approved",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        approval: this.serializeApprovalPayload(approval),
        participant: this.serializeParticipantPayload(participant),
      },
    });
    this.dispatchPromptWithLifecycle(session, approval);

    return this.cloneApproval(approval);
  }

  private dispatchPromptWithLifecycle(session: SharedSession, approval: SharedPromptApproval): void {
    const dispatchInput: DispatchSharedPromptInput = {
      sharedSessionId: session.id,
      hostSessionId: session.hostSessionId,
      participantId: approval.participantId,
      prompt: approval.prompt,
      approvalId: approval.id,
    };

    this.emit({
      type: "prompt_dispatch_started",
      sharedSessionId: session.id,
      timestamp: this.now().toISOString(),
      payload: {
        approval: this.serializeApprovalPayload(approval),
      },
    });

    void this.promptDispatcher(dispatchInput)
      .then(() => {
        this.emit({
          type: "prompt_dispatch_completed",
          sharedSessionId: session.id,
          timestamp: this.now().toISOString(),
          payload: {
            approval: this.serializeApprovalPayload(approval),
          },
        });
      })
      .catch((error) => {
        const approvalRecord = this.approvals.get(approval.id);
        if (approvalRecord && approvalRecord.status === "approved") {
          approvalRecord.status = "failed";
          approvalRecord.errorMessage = error instanceof Error ? error.message : String(error);
        }
        this.emit({
          type: "prompt_dispatch_failed",
          sharedSessionId: session.id,
          timestamp: this.now().toISOString(),
          payload: {
            approval: approvalRecord
              ? this.serializeApprovalPayload(approvalRecord)
              : this.serializeApprovalPayload(approval),
            error: error instanceof Error ? error.message : String(error),
          },
        });
      });
  }

  private registerHostSessionForwarder(session: SharedSession): void {
    const handler: HostSessionNotificationHandler = (notification) => {
      const current = this.ensureSessionActive(session.id, false);
      if (!current) return;

      this.emit({
        type: "host_session_update",
        sharedSessionId: session.id,
        timestamp: this.now().toISOString(),
        payload: {
          notification,
        },
      });
    };

    this.sessionHub.addNotificationInterceptor(session.hostSessionId, handler);
    this.hostInterceptors.set(session.id, {
      hostSessionId: session.hostSessionId,
      handler,
    });
  }

  private finalizeSession(sharedSessionId: string, status: Extract<SharedSessionStatus, "closed" | "expired">): void {
    const session = this.sessions.get(sharedSessionId);
    if (!session || session.status !== "active") return;

    session.status = status;
    const interceptor = this.hostInterceptors.get(sharedSessionId);
    if (interceptor) {
      this.sessionHub.removeNotificationInterceptor(interceptor.hostSessionId, interceptor.handler);
      this.hostInterceptors.delete(sharedSessionId);
    }

    const participantIds = this.participantsBySession.get(sharedSessionId);
    if (participantIds) {
      const endedAt = this.now();
      for (const participantId of participantIds) {
        const participant = this.participants.get(participantId);
        if (participant && !participant.leftAt) {
          participant.leftAt = endedAt;
        }
      }
    }

    this.emit({
      type: "session_closed",
      sharedSessionId,
      timestamp: this.now().toISOString(),
      payload: {
        status,
      },
    });
  }

  private expireSessions(): void {
    const current = this.now().getTime();
    for (const session of this.sessions.values()) {
      if (session.status !== "active") continue;
      if (!session.expiresAt) continue;
      if (session.expiresAt.getTime() <= current) {
        this.finalizeSession(session.id, "expired");
      }
    }
  }

  private ensureSessionActive(sharedSessionId: string, throwIfMissing = true): SharedSession | undefined {
    this.expireSessions();

    const session = this.sessions.get(sharedSessionId);
    if (!session) {
      if (throwIfMissing) {
        throw new SharedSessionError("SESSION_NOT_FOUND", "Shared session not found.", 404);
      }
      return undefined;
    }
    if (session.status !== "active") {
      if (throwIfMissing) {
        throw new SharedSessionError("SESSION_INACTIVE", `Shared session is ${session.status}.`, 409);
      }
      return undefined;
    }
    return session;
  }

  private appendMessage(message: SharedSessionMessage): void {
    const messages = this.messagesBySession.get(message.sharedSessionId) ?? [];
    messages.push(message);
    this.messagesBySession.set(message.sharedSessionId, messages);
  }

  private createApproval(input: {
    sharedSessionId: string;
    participantId: string;
    prompt: string;
    status: SharedPromptStatus;
    resolvedAt?: Date;
    resolvedByParticipantId?: string;
  }): SharedPromptApproval {
    const approval: SharedPromptApproval = {
      id: uuidv4(),
      sharedSessionId: input.sharedSessionId,
      participantId: input.participantId,
      prompt: input.prompt,
      status: input.status,
      createdAt: this.now(),
      resolvedAt: input.resolvedAt,
      resolvedByParticipantId: input.resolvedByParticipantId,
    };
    this.approvals.set(approval.id, approval);
    let set = this.approvalsBySession.get(approval.sharedSessionId);
    if (!set) {
      set = new Set<string>();
      this.approvalsBySession.set(approval.sharedSessionId, set);
    }
    set.add(approval.id);
    return approval;
  }

  private insertParticipant(participant: SharedSessionParticipant): void {
    this.participants.set(participant.id, participant);
    let set = this.participantsBySession.get(participant.sharedSessionId);
    if (!set) {
      set = new Set<string>();
      this.participantsBySession.set(participant.sharedSessionId, set);
    }
    set.add(participant.id);
  }

  private findActiveParticipantByUserId(
    sharedSessionId: string,
    userId: string,
  ): SharedSessionParticipant | undefined {
    const set = this.participantsBySession.get(sharedSessionId);
    if (!set) return undefined;
    const normalizedUserId = userId.trim();
    for (const participantId of set) {
      const participant = this.participants.get(participantId);
      if (!participant) continue;
      if (participant.userId === normalizedUserId && !participant.leftAt) {
        return participant;
      }
    }
    return undefined;
  }

  private canComment(session: SharedSession, role: SharedSessionRole): boolean {
    if (role === "host") return true;
    if (role === "viewer") return false;
    return session.mode !== "view_only";
  }

  private canPrompt(session: SharedSession, role: SharedSessionRole): boolean {
    if (role === "viewer") return false;
    if (session.mode === "prompt_direct" || session.mode === "prompt_with_approval") return true;
    return role === "host";
  }

  private emit(event: SharedSessionEvent): void {
    this.broadcaster.broadcast(event);
  }

  private generateToken(): string {
    return randomBytes(24).toString("base64url");
  }

  private cloneSession(session: SharedSession): SharedSession {
    return {
      ...session,
      createdAt: new Date(session.createdAt),
      expiresAt: session.expiresAt ? new Date(session.expiresAt) : undefined,
    };
  }

  private cloneParticipant(participant: SharedSessionParticipant): SharedSessionParticipant {
    return {
      ...participant,
      joinedAt: new Date(participant.joinedAt),
      leftAt: participant.leftAt ? new Date(participant.leftAt) : undefined,
    };
  }

  private cloneApproval(approval: SharedPromptApproval): SharedPromptApproval {
    return {
      ...approval,
      createdAt: new Date(approval.createdAt),
      resolvedAt: approval.resolvedAt ? new Date(approval.resolvedAt) : undefined,
    };
  }

  private cloneMessage(message: SharedSessionMessage): SharedSessionMessage {
    return {
      ...message,
      createdAt: new Date(message.createdAt),
    };
  }

  private serializeSessionPayload(session: SharedSession): Record<string, unknown> {
    return {
      id: session.id,
      workspaceId: session.workspaceId,
      hostUserId: session.hostUserId,
      hostSessionId: session.hostSessionId,
      mode: session.mode,
      approvalRequired: session.approvalRequired,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt?.toISOString(),
      status: session.status,
    };
  }

  private serializeParticipantPayload(participant: SharedSessionParticipant): Record<string, unknown> {
    return {
      id: participant.id,
      sharedSessionId: participant.sharedSessionId,
      userId: participant.userId,
      displayName: participant.displayName,
      role: participant.role,
      joinedAt: participant.joinedAt.toISOString(),
      leftAt: participant.leftAt?.toISOString(),
    };
  }

  private serializeApprovalPayload(approval: SharedPromptApproval): Record<string, unknown> {
    return {
      id: approval.id,
      sharedSessionId: approval.sharedSessionId,
      participantId: approval.participantId,
      prompt: approval.prompt,
      status: approval.status,
      createdAt: approval.createdAt.toISOString(),
      resolvedAt: approval.resolvedAt?.toISOString(),
      resolvedByParticipantId: approval.resolvedByParticipantId,
      errorMessage: approval.errorMessage,
    };
  }

  private serializeMessagePayload(message: SharedSessionMessage): Record<string, unknown> {
    return {
      id: message.id,
      sharedSessionId: message.sharedSessionId,
      participantId: message.participantId,
      authorUserId: message.authorUserId,
      kind: message.kind,
      text: message.text,
      createdAt: message.createdAt.toISOString(),
      approvalId: message.approvalId,
    };
  }
}
