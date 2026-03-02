//! Webhooks API - /api/webhooks
//!
//! REST endpoints for managing webhook configurations and handling incoming webhook events.
//! In the desktop mode, webhooks are stored in-memory as config stubs.
//!
//! GET/POST/PUT/DELETE /api/webhooks/configs     - Manage webhook configurations
//! GET/POST            /api/webhooks/github       - List / handle GitHub webhook events
//! GET/POST/DELETE     /api/webhooks/register     - Register / unregister webhooks
//! GET                 /api/webhooks/webhook-logs - List webhook delivery logs

use axum::{
    extract::Query,
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route(
            "/configs",
            get(list_configs)
                .post(create_config)
                .put(update_config)
                .delete(delete_config),
        )
        .route("/github", get(list_github_webhooks).post(handle_github_event))
        .route(
            "/register",
            get(list_registrations)
                .post(register_webhook)
                .delete(unregister_webhook),
        )
        .route("/webhook-logs", get(list_logs))
}

// ─── Configs ──────────────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct WebhookQuery {
    workspace_id: Option<String>,
    limit: Option<usize>,
}

async fn list_configs(Query(_q): Query<WebhookQuery>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "configs": [] }))
}

async fn create_config(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "config": body,
        "message": "Webhook config created (desktop mode: ephemeral)"
    }))
}

async fn update_config(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "config": body,
        "message": "Webhook config updated (desktop mode: ephemeral)"
    }))
}

async fn delete_config() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "deleted": true }))
}

// ─── GitHub Webhooks ─────────────────────────────────────────────────────────

async fn list_github_webhooks() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "webhooks": [] }))
}

async fn handle_github_event(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let event_type = body
        .get("type")
        .or_else(|| body.get("action"))
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");
    Json(serde_json::json!({
        "processed": true,
        "eventType": event_type,
        "message": "GitHub webhook event received",
    }))
}

// ─── Registrations ────────────────────────────────────────────────────────────

async fn list_registrations() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "registrations": [] }))
}

async fn register_webhook(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "registered": true,
        "webhook": body,
    }))
}

async fn unregister_webhook() -> Json<serde_json::Value> {
    Json(serde_json::json!({ "unregistered": true }))
}

// ─── Logs ─────────────────────────────────────────────────────────────────────

async fn list_logs(Query(_q): Query<WebhookQuery>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "logs": [] }))
}
