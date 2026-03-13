export type SharedSessionRole = "host" | "collaborator" | "viewer";

export type SharedSessionMode =
  | "view_only"
  | "comment_only"
  | "prompt_with_approval"
  | "prompt_direct";

export type SharedSessionStatus = "active" | "closed" | "expired";

export type SharedPromptStatus = "pending" | "approved" | "rejected" | "failed";

export interface SharedSession {
  id: string;
  workspaceId: string;
  hostUserId: string;
  hostSessionId: string;
  mode: SharedSessionMode;
  approvalRequired: boolean;
  inviteToken: string;
  createdAt: Date;
  expiresAt?: Date;
  status: SharedSessionStatus;
}

export interface SharedSessionParticipant {
  id: string;
  sharedSessionId: string;
  userId: string;
  displayName?: string;
  role: SharedSessionRole;
  accessToken: string;
  joinedAt: Date;
  leftAt?: Date;
}

export interface SharedSessionMessage {
  id: string;
  sharedSessionId: string;
  participantId: string;
  authorUserId: string;
  kind: "comment" | "prompt" | "system";
  text: string;
  createdAt: Date;
  approvalId?: string;
}

export interface SharedPromptApproval {
  id: string;
  sharedSessionId: string;
  participantId: string;
  prompt: string;
  status: SharedPromptStatus;
  createdAt: Date;
  resolvedAt?: Date;
  resolvedByParticipantId?: string;
  errorMessage?: string;
}

export type SharedSessionEventType =
  | "shared_session_created"
  | "session_closed"
  | "participant_joined"
  | "participant_left"
  | "host_session_update"
  | "message_created"
  | "prompt_pending_approval"
  | "prompt_approved"
  | "prompt_rejected"
  | "prompt_dispatch_started"
  | "prompt_dispatch_completed"
  | "prompt_dispatch_failed";

export interface SharedSessionEvent {
  type: SharedSessionEventType;
  sharedSessionId: string;
  timestamp: string;
  payload?: Record<string, unknown>;
}

export interface DispatchSharedPromptInput {
  sharedSessionId: string;
  hostSessionId: string;
  participantId: string;
  prompt: string;
  approvalId?: string;
}

export type SharedPromptDispatcher = (input: DispatchSharedPromptInput) => Promise<void>;

