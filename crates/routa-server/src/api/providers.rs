//! Providers API - Fast provider listing with lazy status checking
//!
//! GET /api/providers - List all providers (instant, status may be "checking")
//! GET /api/providers?check=true - Check provider status (slower, but accurate)

use axum::{
    extract::Query,
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

#[derive(Debug, Clone, Serialize)]
struct ProviderInfo {
    id: String,
    name: String,
    description: String,
    command: String,
    status: String, // "available" | "unavailable" | "checking"
    source: String, // "static" | "registry"
}

#[derive(Debug, Deserialize)]
struct ProvidersQuery {
    #[serde(default)]
    check: bool,
}

// Simple in-memory cache
struct Cache {
    providers: Option<Vec<ProviderInfo>>,
    timestamp: SystemTime,
}

static CACHE: OnceLock<Arc<Mutex<Cache>>> = OnceLock::new();

fn get_cache() -> &'static Arc<Mutex<Cache>> {
    CACHE.get_or_init(|| {
        Arc::new(Mutex::new(Cache {
            providers: None,
            timestamp: SystemTime::UNIX_EPOCH,
        }))
    })
}

const CACHE_TTL: Duration = Duration::from_secs(30);

pub fn router() -> Router {
    Router::new().route("/", get(list_providers))
}

async fn list_providers(Query(query): Query<ProvidersQuery>) -> Json<serde_json::Value> {
    // Fast path: return cached or unchecked providers
    if !query.check {
        let cache = get_cache().lock().unwrap();
        if let Some(ref providers) = cache.providers {
            if cache.timestamp.elapsed().unwrap_or(CACHE_TTL) < CACHE_TTL {
                return Json(serde_json::json!({ "providers": providers }));
            }
        }
        drop(cache);

        // Return unchecked providers immediately
        let providers = get_providers_without_checking().await;
        return Json(serde_json::json!({ "providers": providers }));
    }

    // Slow path: check all provider statuses
    let providers = get_providers_with_checking().await;

    // Update cache
    {
        let mut cache = get_cache().lock().unwrap();
        cache.providers = Some(providers.clone());
        cache.timestamp = SystemTime::now();
    }

    Json(serde_json::json!({ "providers": providers }))
}

/// Fast: Return all providers without checking command availability
async fn get_providers_without_checking() -> Vec<ProviderInfo> {
    use crate::acp_presets;

    let presets = acp_presets::get_standard_presets();
    let mut providers: Vec<ProviderInfo> = presets
        .iter()
        .map(|p| ProviderInfo {
            id: p.name.clone(),
            name: p.name.clone(),
            description: p.description.clone(),
            command: p.command.clone(),
            status: "checking".to_string(),
            source: "static".to_string(),
        })
        .collect();

    // Add registry agents (without checking)
    if let Ok(registry) = crate::acp_registry::fetch_registry().await {
        let static_ids: HashSet<_> = providers.iter().map(|p| p.id.clone()).collect();

        for agent in registry.agents {
            let command = if let Some(npx) = agent.distribution.npx {
                format!("npx {}", npx.package)
            } else if let Some(uvx) = agent.distribution.uvx {
                format!("uvx {}", uvx.package)
            } else if let Some(binary) = agent.distribution.binary {
                let platform = crate::acp_registry::detect_platform_target();
                if let Some(bin) = binary.get(&platform) {
                    bin.cmd.clone().unwrap_or_else(|| agent.id.clone())
                } else {
                    agent.id.clone()
                }
            } else {
                agent.id.clone()
            };

            let provider_id = if static_ids.contains(&agent.id) {
                format!("{}-registry", agent.id)
            } else {
                agent.id.clone()
            };

            let provider_name = if static_ids.contains(&agent.id) {
                format!("{} (Registry)", agent.name)
            } else {
                agent.name.clone()
            };

            providers.push(ProviderInfo {
                id: provider_id,
                name: provider_name,
                description: agent.description,
                command,
                status: "checking".to_string(),
                source: "registry".to_string(),
            });
        }
    }

    providers
}

/// Slow: Check all provider command availability
async fn get_providers_with_checking() -> Vec<ProviderInfo> {
    use crate::{acp_presets, shell_env};

    let presets = acp_presets::get_standard_presets();
    let mut providers: Vec<ProviderInfo> = Vec::new();

    // Check static presets
    for preset in &presets {
        let installed = shell_env::which(&preset.command).is_some();
        providers.push(ProviderInfo {
            id: preset.name.clone(),
            name: preset.name.clone(),
            description: preset.description.clone(),
            command: preset.command.clone(),
            status: if installed {
                "available".to_string()
            } else {
                "unavailable".to_string()
            },
            source: "static".to_string(),
        });
    }

    // Add registry agents with checking
    let static_ids: HashSet<_> = providers.iter().map(|p| p.id.clone()).collect();

    if let Ok(registry) = crate::acp_registry::fetch_registry().await {
        let npx_available = shell_env::which("npx").is_some();
        let uvx_available = shell_env::which("uv").is_some();
        let platform = crate::acp_registry::detect_platform_target();

        for agent in registry.agents {
            let (command, status) = if let Some(npx) = agent.distribution.npx {
                let cmd = format!("npx {}", npx.package);
                let status = if npx_available {
                    "available"
                } else {
                    "unavailable"
                };
                (cmd, status.to_string())
            } else if let Some(uvx) = agent.distribution.uvx {
                let cmd = format!("uvx {}", uvx.package);
                let status = if uvx_available {
                    "available"
                } else {
                    "unavailable"
                };
                (cmd, status.to_string())
            } else if let Some(binary) = agent.distribution.binary {
                if let Some(bin) = binary.get(&platform) {
                    let cmd = bin.cmd.clone().unwrap_or_else(|| agent.id.clone());
                    (cmd, "unavailable".to_string())
                } else {
                    (agent.id.clone(), "unavailable".to_string())
                }
            } else {
                (agent.id.clone(), "unavailable".to_string())
            };

            let provider_id = if static_ids.contains(&agent.id) {
                format!("{}-registry", agent.id)
            } else {
                agent.id.clone()
            };

            let provider_name = if static_ids.contains(&agent.id) {
                format!("{} (Registry)", agent.name)
            } else {
                agent.name.clone()
            };

            providers.push(ProviderInfo {
                id: provider_id,
                name: provider_name,
                description: agent.description,
                command,
                status,
                source: "registry".to_string(),
            });
        }
    }

    // Sort: available first, then alphabetical
    providers.sort_by(|a, b| {
        if a.status == b.status {
            a.name.cmp(&b.name)
        } else if a.status == "available" {
            std::cmp::Ordering::Less
        } else {
            std::cmp::Ordering::Greater
        }
    });

    providers
}
