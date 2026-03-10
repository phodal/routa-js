//! A2UI Dashboard API - /api/a2ui/dashboard
//!
//! Mock implementation for desktop backend.
//! The A2UI protocol is primarily used in the web interface for dashboard rendering.
//! Desktop mode returns minimal mock responses for API compatibility.
//!
//! GET  /api/a2ui/dashboard        - Returns A2UI v0.10 messages (mock)
//! POST /api/a2ui/dashboard        - Accepts custom A2UI messages (mock)
//! GET  /api/a2ui/dashboard/config - Returns dashboard config (mock)
//! PUT  /api/a2ui/dashboard/config - Saves dashboard config (mock)

use axum::{
    extract::Query,
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dashboard", get(get_dashboard).post(post_dashboard))
        .route("/dashboard/config", get(get_dashboard_config).put(put_dashboard_config))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct DashboardQuery {
    workspace_id: Option<String>,
}

/// GET /api/a2ui/dashboard — Mock A2UI dashboard data
async fn get_dashboard(Query(_q): Query<DashboardQuery>) -> Json<serde_json::Value> {
    // Desktop mode: return minimal A2UI response
    Json(serde_json::json!({
        "data": [],
        "kind": "data",
        "metadata": {
            "mimeType": "application/json+a2ui",
            "note": "A2UI protocol is not fully implemented in desktop mode"
        }
    }))
}

/// POST /api/a2ui/dashboard — Mock A2UI custom surface handler
async fn post_dashboard(Json(_body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    // Desktop mode: acknowledge but don't process
    Json(serde_json::json!({
        "success": true,
        "surfaceCount": 0,
        "totalMessages": 0,
        "note": "A2UI protocol is not fully implemented in desktop mode"
    }))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
struct DashboardConfigQuery {
    workspace_id: String,
}

/// GET /api/a2ui/dashboard/config — Mock dashboard config
async fn get_dashboard_config(Query(q): Query<DashboardConfigQuery>) -> Json<serde_json::Value> {
    // Desktop mode: return empty config
    Json(serde_json::json!({
        "config": {
            "id": format!("dc_{}", q.workspace_id),
            "workspaceId": q.workspace_id,
            "surfaceOrder": null,
            "hiddenSurfaces": null,
            "customSurfaces": null,
            "updatedAt": chrono::Utc::now().to_rfc3339()
        }
    }))
}

/// PUT /api/a2ui/dashboard/config — Mock dashboard config save
async fn put_dashboard_config(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    // Desktop mode: acknowledge but don't persist
    let workspace_id = body.get("workspaceId")
        .and_then(|v| v.as_str())
        .unwrap_or("default");
    
    Json(serde_json::json!({
        "success": true,
        "config": {
            "id": format!("dc_{}", workspace_id),
            "workspaceId": workspace_id,
            "surfaceOrder": body.get("surfaceOrder"),
            "hiddenSurfaces": body.get("hiddenSurfaces"),
            "customSurfaces": body.get("customSurfaces"),
            "updatedAt": chrono::Utc::now().to_rfc3339()
        }
    }))
}
