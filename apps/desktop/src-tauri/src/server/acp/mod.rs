//! ACP (Agent Client Protocol) integration using the official Rust SDK.
//!
//! Manages ACP agent processes and provides JSON-RPC communication
//! between the desktop client and coding agents (e.g. Claude, OpenCode).

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::RwLock;

/// Record of an active ACP session.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRecord {
    pub session_id: String,
    pub cwd: String,
    pub workspace_id: String,
    pub provider: Option<String>,
    pub mode_id: Option<String>,
    pub created_at: String,
}

/// Manages ACP agent sessions and process lifecycle.
pub struct AcpManager {
    sessions: Arc<RwLock<HashMap<String, AcpSessionRecord>>>,
}

impl AcpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// List all active ACP sessions.
    pub async fn list_sessions(&self) -> Vec<AcpSessionRecord> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    /// Create a new ACP session record.
    pub async fn create_session(
        &self,
        session_id: String,
        cwd: String,
        workspace_id: String,
        provider: Option<String>,
    ) -> AcpSessionRecord {
        let record = AcpSessionRecord {
            session_id: session_id.clone(),
            cwd,
            workspace_id,
            provider,
            mode_id: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        let mut sessions = self.sessions.write().await;
        sessions.insert(session_id, record.clone());
        record
    }

    /// Get a session by ID.
    pub async fn get_session(&self, session_id: &str) -> Option<AcpSessionRecord> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }

    /// Remove a session.
    pub async fn remove_session(&self, session_id: &str) {
        let mut sessions = self.sessions.write().await;
        sessions.remove(session_id);
    }

    /// Spawn an ACP agent process using stdio transport.
    ///
    /// Creates a child process for a coding agent (e.g., `claude`, `opencode`)
    /// and establishes a JSON-RPC connection over stdio.
    pub async fn spawn_agent_process(
        &self,
        command: &str,
        args: &[&str],
        cwd: &str,
        env: HashMap<String, String>,
    ) -> Result<tokio::process::Child, String> {
        let mut cmd = tokio::process::Command::new(command);
        cmd.args(args)
            .current_dir(cwd)
            .stdin(std::process::Stdio::piped())
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped());

        for (key, value) in &env {
            cmd.env(key, value);
        }

        cmd.spawn()
            .map_err(|e| format!("Failed to spawn ACP agent '{}': {}", command, e))
    }
}

/// ACP provider presets for known coding agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPreset {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub description: String,
}

/// Get the list of known ACP agent presets.
pub fn get_presets() -> Vec<AcpPreset> {
    vec![
        AcpPreset {
            name: "claude".to_string(),
            command: "claude".to_string(),
            args: vec!["--acp".to_string()],
            description: "Claude Code (Anthropic)".to_string(),
        },
        AcpPreset {
            name: "opencode".to_string(),
            command: "opencode".to_string(),
            args: vec!["acp".to_string()],
            description: "OpenCode ACP agent".to_string(),
        },
        AcpPreset {
            name: "codex-acp".to_string(),
            command: "npx".to_string(),
            args: vec!["codex-acp".to_string()],
            description: "Codex ACP agent".to_string(),
        },
        AcpPreset {
            name: "copilot".to_string(),
            command: "gh".to_string(),
            args: vec![
                "copilot".to_string(),
                "agent".to_string(),
                "--acp".to_string(),
            ],
            description: "GitHub Copilot ACP agent".to_string(),
        },
    ]
}

/// Connect to an ACP agent process via stdio and establish a client-side connection.
///
/// Uses the `agent-client-protocol` crate's `ClientSideConnection` for
/// bi-directional JSON-RPC communication.
///
/// Example usage:
/// ```no_run
/// use agent_client_protocol::ClientSideConnection;
/// // After spawning the process and getting stdin/stdout handles,
/// // create a ClientSideConnection for JSON-RPC communication.
/// ```
pub async fn connect_to_agent(
    _command: &str,
    _args: &[&str],
    _cwd: &str,
) -> Result<(), String> {
    // TODO: Implement full ACP client connection using agent-client-protocol crate.
    //
    // The flow is:
    // 1. Spawn the agent process
    // 2. Create a ClientSideConnection from stdin/stdout
    // 3. Send initialize request
    // 4. Create a session via session/new
    // 5. Send prompts via session/prompt
    // 6. Handle session/update notifications
    //
    // This requires implementing the Client trait from agent-client-protocol.
    Ok(())
}
