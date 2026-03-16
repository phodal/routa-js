//! Sandbox type definitions for code execution sandboxes.
//!
//! These types mirror the concepts from the article:
//! https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents

use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Docker label used to identify sandbox containers.
pub const SANDBOX_LABEL: &str = "routa.sandbox";

/// Docker image name for the in-sandbox server.
pub const SANDBOX_IMAGE: &str = "routa/sandbox:latest";

/// Port the in-sandbox FastAPI/Jupyter server listens on.
pub const SANDBOX_CONTAINER_PORT: u16 = 8000;

/// Idle timeout in seconds before a sandbox is automatically terminated.
pub const SANDBOX_IDLE_TIMEOUT_SECS: u64 = 60;

/// Interval in seconds for checking idle sandboxes.
pub const SANDBOX_CHECK_INTERVAL_SECS: u64 = 60;

/// Information about a running sandbox container.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SandboxInfo {
    /// Docker container ID.
    pub id: String,
    /// Docker container name.
    pub name: String,
    /// Container status (e.g., "running").
    pub status: String,
    /// Programming language supported (e.g., "python").
    pub lang: String,
    /// Host port mapped to the in-sandbox server.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub port: Option<u16>,
    /// When this sandbox was created.
    pub created_at: DateTime<Utc>,
    /// When this sandbox was last active.
    pub last_active_at: DateTime<Utc>,
}

/// Request body for creating a new sandbox.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateSandboxRequest {
    /// Language for the sandbox kernel (currently only "python" is supported).
    pub lang: String,
}

/// Request body for executing code in a sandbox.
#[derive(Debug, Deserialize, Serialize)]
pub struct ExecuteRequest {
    /// The source code to execute.
    pub code: String,
}

/// A single streaming output event from code execution.
///
/// Events are serialized as NDJSON (newline-delimited JSON) in the HTTP response.
/// The in-sandbox server at `/execute` streams these events.
#[derive(Debug, Serialize, Deserialize)]
#[serde(untagged)]
pub enum SandboxOutputEvent {
    /// Text output (stdout / print statements).
    Text { text: String },
    /// Image output (base64-encoded PNG from matplotlib etc.).
    Image { image: String },
    /// Error output (traceback).
    Error { error: String },
}
