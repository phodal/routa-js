//! Background Tasks API - /api/background-tasks
//!
//! Persistent background task queue for async work (email, report generation, etc.)
//! In the desktop backend, background tasks are handled by the embedded scheduler;
//! this REST surface mirrors the Next.js API for frontend compatibility.
//!
//! GET    /api/background-tasks              - List tasks
//! POST   /api/background-tasks              - Enqueue a new task
//! POST   /api/background-tasks/process      - Process the next pending task
//! GET    /api/background-tasks/{id}         - Get a task by ID
//! DELETE /api/background-tasks/{id}         - Cancel / delete a task
//! POST   /api/background-tasks/{id}/retry   - Retry a failed task

use axum::{
    extract::{Path, Query},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_tasks).post(create_task))
        .route("/process", axum::routing::post(process_task))
        .route("/{id}", get(get_task).delete(delete_task))
        .route("/{id}/retry", axum::routing::post(retry_task))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    workspace_id: Option<String>,
    status: Option<String>,
}

/// GET /api/background-tasks — List background tasks
async fn list_tasks(Query(_q): Query<ListQuery>) -> Json<serde_json::Value> {
    // Desktop mode: background tasks are embedded in the scheduler;
    // return empty list for REST compatibility.
    Json(serde_json::json!({ "tasks": [] }))
}

/// POST /api/background-tasks — Enqueue a background task
async fn create_task(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let id = uuid::Uuid::new_v4().to_string();
    Json(serde_json::json!({
        "task": {
            "id": id,
            "type": body.get("type").and_then(|v| v.as_str()).unwrap_or("unknown"),
            "status": "pending",
            "workspaceId": body.get("workspaceId").and_then(|v| v.as_str()).unwrap_or("default"),
            "createdAt": chrono::Utc::now().to_rfc3339(),
            "payload": body.get("payload"),
        }
    }))
}

/// POST /api/background-tasks/process — Process the next pending task
async fn process_task() -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "processed": 0,
        "message": "No pending background tasks in desktop mode",
    }))
}

/// GET /api/background-tasks/{id} — Get a task by ID
async fn get_task(Path(id): Path<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "error": format!("Background task {} not found", id),
        "code": "NOT_FOUND"
    }))
}

/// DELETE /api/background-tasks/{id} — Cancel a task
async fn delete_task(Path(id): Path<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "deleted": true, "id": id }))
}

/// POST /api/background-tasks/{id}/retry — Retry a failed task
async fn retry_task(Path(id): Path<String>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "retried": true,
        "id": id,
        "message": "Retry queued (desktop mode: ephemeral)",
    }))
}
