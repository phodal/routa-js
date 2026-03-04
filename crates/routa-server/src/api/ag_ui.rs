//! AG-UI Protocol API - /api/ag-ui
//!
//! Mock implementation for desktop backend.
//! The AG-UI protocol is primarily used in the web interface for protocol bridging.
//! Desktop mode returns a minimal mock response for API compatibility.
//!
//! POST /api/ag-ui - Accept RunAgentInput, return SSE stream (mock)

use axum::{routing::post, Json, Router};

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", post(ag_ui_handler))
}

/// POST /api/ag-ui — Mock AG-UI protocol handler
async fn ag_ui_handler(Json(_body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    // Desktop mode: AG-UI protocol is not fully implemented
    // Return error indicating this is a web-only feature
    Json(serde_json::json!({
        "error": "AG-UI protocol is not available in desktop mode",
        "code": "NOT_IMPLEMENTED",
        "message": "Use the web interface for AG-UI protocol support"
    }))
}
