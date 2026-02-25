//! Provider Models API
//!
//! GET /api/providers/models?provider=<id>
//!
//! Runs the provider's model listing command and returns available models.
//! Designed to be extensible: each provider can define its own model listing command.

use axum::{extract::Query, routing::get, Json, Router};
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, SystemTime};

use crate::state::AppState;

#[derive(Debug, Deserialize)]
struct ModelsQuery {
    provider: String,
}

/// Describes how to list models for a provider.
struct ProviderModelConfig {
    /// The CLI command to run (e.g., "opencode")
    command: &'static str,
    /// Arguments to pass (e.g., ["models"])
    args: &'static [&'static str],
    /// How to parse a line of output into a model ID (None = use line as-is)
    /// Lines that don't contain '/' are filtered out (not valid model IDs)
    filter_fn: fn(&str) -> bool,
}

fn default_filter(line: &str) -> bool {
    !line.is_empty() && line.contains('/')
}

/// Registry of providers that support model listing.
fn provider_model_configs() -> HashMap<&'static str, ProviderModelConfig> {
    let mut map = HashMap::new();
    map.insert(
        "opencode",
        ProviderModelConfig {
            command: "opencode",
            args: &["models"],
            filter_fn: default_filter,
        },
    );
    // Future providers can be added here, e.g.:
    // map.insert("gemini", ProviderModelConfig { command: "gemini", args: &["models", "--list"], filter_fn: ... });
    map
}

// ─── Cache ───────────────────────────────────────────────────────────────────

struct ModelsCache {
    by_provider: HashMap<String, (Vec<String>, SystemTime)>,
}

static MODELS_CACHE: OnceLock<Arc<Mutex<ModelsCache>>> = OnceLock::new();

fn get_models_cache() -> &'static Arc<Mutex<ModelsCache>> {
    MODELS_CACHE.get_or_init(|| {
        Arc::new(Mutex::new(ModelsCache {
            by_provider: HashMap::new(),
        }))
    })
}

const MODELS_CACHE_TTL: Duration = Duration::from_secs(300); // 5 minutes

// ─── Router ──────────────────────────────────────────────────────────────────

pub fn router() -> Router<AppState> {
    Router::new().route("/models", get(list_models))
}

async fn list_models(
    Query(query): Query<ModelsQuery>,
) -> Json<serde_json::Value> {
    let provider = query.provider.as_str();

    // Check cache
    {
        let cache = get_models_cache().lock().unwrap();
        if let Some((models, ts)) = cache.by_provider.get(provider) {
            if ts.elapsed().unwrap_or(MODELS_CACHE_TTL) < MODELS_CACHE_TTL {
                return Json(serde_json::json!({ "models": models, "cached": true }));
            }
        }
    }

    let configs = provider_model_configs();
    let Some(config) = configs.get(provider) else {
        return Json(serde_json::json!({ "models": [], "error": "Provider does not support model listing" }));
    };

    let resolved = match crate::shell_env::which(config.command) {
        Some(p) => p,
        None => {
            return Json(serde_json::json!({
                "models": [],
                "error": format!("'{}' not found in PATH", config.command)
            }));
        }
    };

    let result = tokio::time::timeout(
        Duration::from_secs(15),
        tokio::process::Command::new(&resolved)
            .args(config.args)
            .env("PATH", crate::shell_env::full_path())
            .output(),
    )
    .await;

    let models: Vec<String> = match result {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            stdout
                .lines()
                .map(|l| l.trim().to_string())
                .filter(|l| (config.filter_fn)(l))
                .collect()
        }
        Ok(Err(e)) => {
            tracing::warn!("[provider_models] Failed to run '{}': {}", config.command, e);
            return Json(serde_json::json!({ "models": [], "error": e.to_string() }));
        }
        Err(_) => {
            tracing::warn!("[provider_models] Timeout listing models for '{}'", provider);
            return Json(serde_json::json!({ "models": [], "error": "Timeout" }));
        }
    };

    // Update cache
    {
        let mut cache = get_models_cache().lock().unwrap();
        cache
            .by_provider
            .insert(provider.to_string(), (models.clone(), SystemTime::now()));
    }

    Json(serde_json::json!({ "models": models }))
}
