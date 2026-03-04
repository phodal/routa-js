//! A2UI Dashboard API - /api/a2ui/dashboard
//!
//! Mock implementation for desktop backend.
//! The A2UI protocol is primarily used in the web interface for dashboard rendering.
//! Desktop mode returns minimal mock responses for API compatibility.
//!
//! GET  /api/a2ui/dashboard - Returns A2UI v0.10 messages (mock)
//! POST /api/a2ui/dashboard - Accepts custom A2UI messages (mock)

use axum::{
    extract::Query,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/dashboard", get(get_dashboard).post(post_dashboard))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
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
