//! ACP (Agent Client Protocol) integration.
//!
//! Manages ACP agent processes and provides JSON-RPC communication
//! between the desktop client and coding agents (e.g. OpenCode, Claude, Copilot).
//!
//! Architecture (matches the Next.js `AcpProcessManager`):
//!   - `session/new`    → spawns a child process, sends `initialize` + `session/new`
//!   - `session/prompt` → reuses the live process, sends `session/prompt`
//!   - `session/cancel` → sends cancellation notification
//!   - SSE GET          → subscribes to `broadcast` channel for `session/update` events
//!
//! **Claude Code** uses a different protocol (stream-json) instead of ACP.
//! The `ClaudeCodeProcess` translates Claude's output into ACP-compatible
//! `session/update` notifications for frontend compatibility.
//!
//! **Agent Trace**: All sessions record trace events to JSONL files for
//! attribution tracking (which model/session/tool affected which files and when).

pub mod binary_manager;
pub mod claude_code_process;
pub mod installation_state;
pub mod paths;
pub mod process;
pub mod registry_types;

pub use binary_manager::AcpBinaryManager;
pub use claude_code_process::{ClaudeCodeConfig, ClaudeCodeProcess};
pub use installation_state::AcpInstallationState;
pub use paths::AcpPaths;
pub use registry_types::*;

use std::collections::HashMap;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::{broadcast, RwLock};

use process::AcpProcess;
use crate::trace::{
    Contributor, TraceConversation, TraceEventType, TraceRecord, TraceWriter,
};

// ─── Session Record ─────────────────────────────────────────────────────

/// Record of an active ACP session persisted for UI listing.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRecord {
    pub session_id: String,
    pub cwd: String,
    pub workspace_id: String,
    pub provider: Option<String>,
    pub role: Option<String>,
    pub mode_id: Option<String>,
    pub created_at: String,
}

// ─── Managed Process ────────────────────────────────────────────────────

/// Process type enum to support both ACP and Claude stream-json protocols.
enum AgentProcessType {
    /// Standard ACP protocol (opencode, gemini, copilot, etc.)
    Acp(Arc<AcpProcess>),
    /// Claude Code stream-json protocol
    Claude(Arc<ClaudeCodeProcess>),
}

/// A managed agent process with its metadata.
struct ManagedProcess {
    process: AgentProcessType,
    /// The agent's own session ID (returned by `session/new` or claude's session_id).
    acp_session_id: String,
    preset_id: String,
    #[allow(dead_code)]
    created_at: String,
    /// Trace writer for recording agent activities to JSONL
    trace_writer: TraceWriter,
    /// Working directory (for contributor context)
    cwd: String,
}

// ─── ACP Manager ────────────────────────────────────────────────────────

/// Manages ACP agent sessions and process lifecycle.
///
/// Each session maps to a long-lived child process that communicates via
/// stdio JSON-RPC. Notifications are forwarded to subscribers via broadcast.
#[derive(Clone)]
pub struct AcpManager {
    /// Our sessionId → session record (for UI listing)
    sessions: Arc<RwLock<HashMap<String, AcpSessionRecord>>>,
    /// Our sessionId → managed process (the live agent)
    processes: Arc<RwLock<HashMap<String, ManagedProcess>>>,
    /// Our sessionId → broadcast sender for SSE notifications
    notification_channels: Arc<RwLock<HashMap<String, broadcast::Sender<serde_json::Value>>>>,
}

impl AcpManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(HashMap::new())),
            processes: Arc::new(RwLock::new(HashMap::new())),
            notification_channels: Arc::new(RwLock::new(HashMap::new())),
        }
    }

    /// List all session records.
    pub async fn list_sessions(&self) -> Vec<AcpSessionRecord> {
        let sessions = self.sessions.read().await;
        sessions.values().cloned().collect()
    }

    /// Get a session record by ID.
    pub async fn get_session(&self, session_id: &str) -> Option<AcpSessionRecord> {
        let sessions = self.sessions.read().await;
        sessions.get(session_id).cloned()
    }

    /// Create a new ACP session: spawn agent process, initialize, create session.
    /// Supports both static presets and registry-based agents.
    /// **Claude** uses stream-json protocol instead of ACP.
    ///
    /// Returns `(our_session_id, agent_session_id)`.
    pub async fn create_session(
        &self,
        session_id: String,
        cwd: String,
        workspace_id: String,
        provider: Option<String>,
        role: Option<String>,
        model: Option<String>,
    ) -> Result<(String, String), String> {
        let provider_name = provider.as_deref().unwrap_or("opencode");

        // Create the notification broadcast channel for this session
        let (ntx, _) = broadcast::channel::<serde_json::Value>(256);

        // Check if this is Claude (uses stream-json protocol, not ACP)
        let (process_type, acp_session_id) = if provider_name == "claude" {
            // Use Claude Code stream-json protocol
            let config = ClaudeCodeConfig {
                command: "claude".to_string(),
                cwd: cwd.clone(),
                display_name: format!("Claude-{}", &session_id[..8.min(session_id.len())]),
                permission_mode: Some("bypassPermissions".to_string()),
                mcp_configs: Vec::new(),
            };

            let claude_process = ClaudeCodeProcess::spawn(config, ntx.clone()).await?;
            let claude_session_id = claude_process
                .session_id()
                .await
                .unwrap_or_else(|| format!("claude-{}", &session_id[..8.min(session_id.len())]));

            (
                AgentProcessType::Claude(Arc::new(claude_process)),
                claude_session_id,
            )
        } else {
            // Use standard ACP protocol
            let preset = get_preset_by_id_with_registry(provider_name).await?;

            // Build args: preset args + optional model flag
            let mut extra_args: Vec<String> = preset.args.clone();
            if let Some(ref m) = model {
                if !m.is_empty() {
                    // opencode (and future providers) accept -m <model>
                    extra_args.push("-m".to_string());
                    extra_args.push(m.clone());
                }
            }

            let process = AcpProcess::spawn(
                &preset.command,
                &extra_args.iter().map(|s| s.as_str()).collect::<Vec<_>>(),
                &cwd,
                ntx.clone(),
                &preset.name,
                &session_id,
            )
            .await?;

            // Initialize the protocol
            process.initialize().await?;

            // Create the agent session
            let agent_session_id = process.new_session(&cwd).await?;

            (AgentProcessType::Acp(Arc::new(process)), agent_session_id)
        };

        // Create TraceWriter for this session
        let trace_writer = TraceWriter::new(&cwd);

        // Store everything
        let record = AcpSessionRecord {
            session_id: session_id.clone(),
            cwd: cwd.clone(),
            workspace_id: workspace_id.clone(),
            provider: Some(provider_name.to_string()),
            role: role.clone().or(Some("CRAFTER".to_string())),
            mode_id: None,
            created_at: chrono::Utc::now().to_rfc3339(),
        };

        self.sessions
            .write()
            .await
            .insert(session_id.clone(), record);

        self.processes.write().await.insert(
            session_id.clone(),
            ManagedProcess {
                process: process_type,
                acp_session_id: acp_session_id.clone(),
                preset_id: provider_name.to_string(),
                created_at: chrono::Utc::now().to_rfc3339(),
                trace_writer: trace_writer.clone(),
                cwd: cwd.clone(),
            },
        );

        self.notification_channels
            .write()
            .await
            .insert(session_id.clone(), ntx);

        // Record SessionStart trace
        let trace = TraceRecord::new(
            &session_id,
            TraceEventType::SessionStart,
            Contributor::new(provider_name, None),
        )
        .with_workspace_id(&workspace_id)
        .with_metadata("role", serde_json::json!(role.as_deref().unwrap_or("CRAFTER")))
        .with_metadata("cwd", serde_json::json!(cwd));

        trace_writer.append_safe(&trace).await;

        tracing::info!(
            "[AcpManager] Session {} created (provider: {}, agent session: {})",
            session_id,
            provider_name,
            acp_session_id,
        );

        Ok((session_id, acp_session_id))
    }

    /// Send a prompt to an existing session's agent process.
    pub async fn prompt(
        &self,
        session_id: &str,
        text: &str,
    ) -> Result<serde_json::Value, String> {
        let processes = self.processes.read().await;
        let managed = processes
            .get(session_id)
            .ok_or_else(|| format!("No agent process for session: {}", session_id))?;

        let is_alive = match &managed.process {
            AgentProcessType::Acp(p) => p.is_alive(),
            AgentProcessType::Claude(p) => p.is_alive(),
        };

        if !is_alive {
            return Err(format!(
                "Agent ({}) process is not running",
                managed.preset_id
            ));
        }

        // Record UserMessage trace
        let trace = TraceRecord::new(
            session_id,
            TraceEventType::UserMessage,
            Contributor::new(&managed.preset_id, None),
        )
        .with_conversation(TraceConversation {
            turn: None,
            role: Some("user".to_string()),
            content_preview: Some(truncate_content(text, 500)),
            full_content: None,
        });

        managed.trace_writer.append_safe(&trace).await;

        match &managed.process {
            AgentProcessType::Acp(p) => p.prompt(&managed.acp_session_id, text).await,
            AgentProcessType::Claude(p) => {
                let stop_reason = p.prompt(text).await?;
                Ok(serde_json::json!({ "stopReason": stop_reason }))
            }
        }
    }

    /// Cancel the current prompt in a session.
    pub async fn cancel(&self, session_id: &str) {
        let processes = self.processes.read().await;
        if let Some(managed) = processes.get(session_id) {
            match &managed.process {
                AgentProcessType::Acp(p) => p.cancel(&managed.acp_session_id).await,
                AgentProcessType::Claude(p) => p.cancel().await,
            }
        }
    }

    /// Kill a session's agent process and remove it.
    pub async fn kill_session(&self, session_id: &str) {
        // Kill the process
        if let Some(managed) = self.processes.write().await.remove(session_id) {
            // Record SessionEnd trace before killing
            let trace = TraceRecord::new(
                session_id,
                TraceEventType::SessionEnd,
                Contributor::new(&managed.preset_id, None),
            );
            managed.trace_writer.append_safe(&trace).await;

            match &managed.process {
                AgentProcessType::Acp(p) => p.kill().await,
                AgentProcessType::Claude(p) => p.kill().await,
            }
        }
        // Remove session record
        self.sessions.write().await.remove(session_id);
        // Remove notification channel
        self.notification_channels.write().await.remove(session_id);
    }

    /// Subscribe to SSE notifications for a session.
    /// Returns a broadcast receiver that yields `session/update` JSON-RPC messages.
    pub async fn subscribe(
        &self,
        session_id: &str,
    ) -> Option<broadcast::Receiver<serde_json::Value>> {
        let channels = self.notification_channels.read().await;
        channels.get(session_id).map(|tx| tx.subscribe())
    }

    /// Check if a session's agent process is alive.
    pub async fn is_alive(&self, session_id: &str) -> bool {
        let processes = self.processes.read().await;
        processes
            .get(session_id)
            .map(|m| match &m.process {
                AgentProcessType::Acp(p) => p.is_alive(),
                AgentProcessType::Claude(p) => p.is_alive(),
            })
            .unwrap_or(false)
    }

    /// Get the preset ID for a session.
    pub async fn get_preset_id(&self, session_id: &str) -> Option<String> {
        let processes = self.processes.read().await;
        processes.get(session_id).map(|m| m.preset_id.clone())
    }
}

// ─── ACP Presets ────────────────────────────────────────────────────────

/// ACP provider presets for known coding agents.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AcpPreset {
    pub name: String,
    pub command: String,
    pub args: Vec<String>,
    pub description: String,
}

/// Get the list of known ACP agent presets (static/builtin only).
pub fn get_presets() -> Vec<AcpPreset> {
    vec![
        AcpPreset {
            name: "opencode".to_string(),
            command: "opencode".to_string(),
            args: vec!["acp".to_string()],
            description: "OpenCode AI coding agent".to_string(),
        },
        AcpPreset {
            name: "gemini".to_string(),
            command: "gemini".to_string(),
            args: vec!["--experimental-acp".to_string()],
            description: "Google Gemini CLI".to_string(),
        },
        AcpPreset {
            name: "codex-acp".to_string(),
            command: "codex-acp".to_string(),
            args: vec![],
            description: "OpenAI Codex CLI (codex-acp wrapper)".to_string(),
        },
        AcpPreset {
            name: "copilot".to_string(),
            command: "copilot".to_string(),
            args: vec!["--acp".to_string()],
            description: "GitHub Copilot CLI".to_string(),
        },
        AcpPreset {
            name: "auggie".to_string(),
            command: "auggie".to_string(),
            args: vec!["--acp".to_string()],
            description: "Augment Code's AI agent".to_string(),
        },
        AcpPreset {
            name: "kimi".to_string(),
            command: "kimi".to_string(),
            args: vec!["acp".to_string()],
            description: "Moonshot AI's Kimi CLI".to_string(),
        },
        AcpPreset {
            name: "kiro".to_string(),
            command: "kiro-cli".to_string(),
            args: vec!["acp".to_string()],
            description: "Amazon Kiro AI coding agent".to_string(),
        },
        AcpPreset {
            name: "claude".to_string(),
            command: "claude".to_string(),
            args: vec!["--acp".to_string()],
            description: "Anthropic Claude Code".to_string(),
        },
    ]
}

/// ACP Registry URL
const ACP_REGISTRY_URL: &str = "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

/// Get a preset by ID, checking both static presets and registry.
/// Static presets take precedence.
///
/// Supports suffixed IDs like "auggie-registry" to explicitly request
/// the registry version when both built-in and registry versions exist.
pub async fn get_preset_by_id_with_registry(id: &str) -> Result<AcpPreset, String> {
    // Handle suffixed IDs (e.g., "auggie-registry")
    // This allows explicit selection of registry version when both exist
    const REGISTRY_SUFFIX: &str = "-registry";
    if id.ends_with(REGISTRY_SUFFIX) {
        let base_id = &id[..id.len() - REGISTRY_SUFFIX.len()];
        let mut preset = get_registry_preset(base_id).await?;
        // Keep the suffixed ID in the returned preset for consistency
        preset.name = id.to_string();
        return Ok(preset);
    }

    // Check static presets first
    if let Some(preset) = get_presets().into_iter().find(|p| p.name == id) {
        return Ok(preset);
    }

    // Fall back to registry
    get_registry_preset(id).await
}

/// Get a preset from the ACP registry by ID.
async fn get_registry_preset(id: &str) -> Result<AcpPreset, String> {
    // Fetch registry
    let response = reqwest::get(ACP_REGISTRY_URL)
        .await
        .map_err(|e| format!("Failed to fetch ACP registry: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("Registry fetch failed: {}", response.status()));
    }

    let registry: AcpRegistry = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse registry: {}", e))?;

    // Find the agent
    let agent = registry
        .agents
        .into_iter()
        .find(|a| a.id == id)
        .ok_or_else(|| format!("Agent '{}' not found in registry", id))?;

    // Build command from distribution
    let (command, args) = if let Some(ref npx) = agent.distribution.npx {
        let mut args = vec!["-y".to_string(), npx.package.clone()];
        args.extend(npx.args.clone());
        ("npx".to_string(), args)
    } else if let Some(ref uvx) = agent.distribution.uvx {
        let mut args = vec![uvx.package.clone()];
        args.extend(uvx.args.clone());
        ("uvx".to_string(), args)
    } else {
        return Err(format!(
            "Agent '{}' has no supported distribution (npx/uvx)",
            id
        ));
    };

    Ok(AcpPreset {
        name: agent.id,
        command,
        args,
        description: agent.description,
    })
}

// ─── Utility Functions ─────────────────────────────────────────────────────

/// Truncate content to a maximum length for storage in traces.
fn truncate_content(text: &str, max_len: usize) -> String {
    if text.len() <= max_len {
        text.to_string()
    } else {
        format!("{}...", &text[..max_len.saturating_sub(3)])
    }
}
