//! ACP Registry fetch utilities (shared between CLI and HTTP server).

use super::registry_types::AcpRegistry;

const REGISTRY_URL: &str =
    "https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json";

/// Fetch the live ACP registry from the CDN.
pub async fn fetch_registry() -> Result<AcpRegistry, String> {
    let resp = reqwest::get(REGISTRY_URL)
        .await
        .map_err(|e| format!("Failed to fetch ACP registry: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("ACP registry returned HTTP {}", resp.status()));
    }

    resp.json::<AcpRegistry>()
        .await
        .map_err(|e| format!("Failed to parse ACP registry JSON: {}", e))
}

/// Fetch raw registry JSON value (useful when callers do not want typed structs).
pub async fn fetch_registry_json() -> Result<serde_json::Value, String> {
    let resp = reqwest::get(REGISTRY_URL)
        .await
        .map_err(|e| format!("Failed to fetch ACP registry: {}", e))?;

    if !resp.status().is_success() {
        return Err(format!("ACP registry returned HTTP {}", resp.status()));
    }

    resp.json::<serde_json::Value>()
        .await
        .map_err(|e| format!("Failed to parse ACP registry JSON: {}", e))
}
