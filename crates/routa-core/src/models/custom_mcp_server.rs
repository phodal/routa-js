use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// Transport type for a custom MCP server.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum McpServerType {
    Stdio,
    Http,
    Sse,
}

impl std::fmt::Display for McpServerType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            McpServerType::Stdio => write!(f, "stdio"),
            McpServerType::Http => write!(f, "http"),
            McpServerType::Sse => write!(f, "sse"),
        }
    }
}

impl std::str::FromStr for McpServerType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "stdio" => Ok(McpServerType::Stdio),
            "http" => Ok(McpServerType::Http),
            "sse" => Ok(McpServerType::Sse),
            other => Err(format!("Unknown McpServerType: {}", other)),
        }
    }
}

/// A user-defined custom MCP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomMcpServer {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub server_type: McpServerType,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub args: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    /// JSON object of HTTP request headers.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub headers: Option<serde_json::Value>,
    /// JSON object of environment variable overrides.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env: Option<serde_json::Value>,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new custom MCP server.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCustomMcpServerInput {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub server_type: McpServerType,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub headers: Option<serde_json::Value>,
    pub env: Option<serde_json::Value>,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub workspace_id: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Input for updating an existing custom MCP server.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCustomMcpServerInput {
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(rename = "type")]
    pub server_type: Option<McpServerType>,
    pub command: Option<String>,
    pub args: Option<Vec<String>>,
    pub url: Option<String>,
    pub headers: Option<serde_json::Value>,
    pub env: Option<serde_json::Value>,
    pub enabled: Option<bool>,
}
