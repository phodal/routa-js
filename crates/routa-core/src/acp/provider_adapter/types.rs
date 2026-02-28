//! Provider Adapter Types
//!
//! Defines the unified message format that all ACP providers normalize to.

use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Supported provider types.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ProviderType {
    Claude,
    OpenCode,
    Kimi,
    Gemini,
    Copilot,
    Codex,
    Auggie,
    Kiro,
    Standard,
}

impl ProviderType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Claude => "claude",
            Self::OpenCode => "opencode",
            Self::Kimi => "kimi",
            Self::Gemini => "gemini",
            Self::Copilot => "copilot",
            Self::Codex => "codex",
            Self::Auggie => "auggie",
            Self::Kiro => "kiro",
            Self::Standard => "standard",
        }
    }
}

/// Provider behavior configuration.
#[derive(Debug, Clone)]
pub struct ProviderBehavior {
    pub provider_type: ProviderType,
    /// Whether tool_call events include rawInput immediately.
    pub immediate_tool_input: bool,
    /// Whether the provider uses streaming (chunks).
    pub streaming: bool,
}

/// Normalized event types for unified handling.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NormalizedEventType {
    ToolCall,
    ToolCallUpdate,
    AgentMessage,
    AgentThought,
    UserMessage,
    PlanUpdate,
    TurnComplete,
    Error,
}

/// Normalized tool call information.
#[derive(Debug, Clone)]
pub struct NormalizedToolCall {
    pub tool_call_id: String,
    pub name: String,
    pub title: Option<String>,
    pub status: ToolStatus,
    pub input: Option<Value>,
    pub output: Option<Value>,
    /// Whether input is finalized (false = may be updated later)
    pub input_finalized: bool,
}

/// Tool execution status.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ToolStatus {
    Pending,
    Running,
    Completed,
    Failed,
}

impl ToolStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Pending => "pending",
            Self::Running => "running",
            Self::Completed => "completed",
            Self::Failed => "failed",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "completed" => Self::Completed,
            "failed" => Self::Failed,
            "running" | "in_progress" => Self::Running,
            "pending" => Self::Pending,
            _ => Self::Completed,
        }
    }
}

/// Normalized session update message.
#[derive(Debug, Clone)]
pub struct NormalizedSessionUpdate {
    pub session_id: String,
    pub provider: String,
    pub event_type: NormalizedEventType,
    pub tool_call: Option<NormalizedToolCall>,
    pub message: Option<NormalizedMessage>,
    /// Plan items (for PlanUpdate events)
    pub plan_items: Option<Vec<NormalizedPlanItem>>,
}

/// A single plan item in a plan_update event.
#[derive(Debug, Clone)]
pub struct NormalizedPlanItem {
    pub description: String,
    pub status: String,
}

/// Normalized message content.
#[derive(Debug, Clone)]
pub struct NormalizedMessage {
    pub role: String,
    pub content: String,
    pub is_chunk: bool,
}

/// Helper to check if rawInput is present and non-empty.
pub fn has_input(raw_input: &Option<Value>) -> bool {
    raw_input.as_ref().map_or(false, |v| {
        if let Some(obj) = v.as_object() {
            !obj.is_empty()
        } else {
            !v.is_null()
        }
    })
}

