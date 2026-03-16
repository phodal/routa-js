//! Sandbox API routes — Docker-based isolated code execution.
//!
//! Implements the REST API described in:
//! https://amirmalik.net/2025/03/07/code-sandboxes-for-llm-ai-agents
//!
//! # Endpoints
//!
//! | Method | Path                          | Description                  |
//! |--------|-------------------------------|------------------------------|
//! | GET    | `/sandboxes`                  | List all sandboxes           |
//! | POST   | `/sandboxes`                  | Create a new sandbox         |
//! | GET    | `/sandboxes/:id`              | Get sandbox info             |
//! | POST   | `/sandboxes/:id/execute`      | Execute code (NDJSON stream) |
//! | DELETE | `/sandboxes/:id`              | Delete a sandbox             |

use axum::{
    body::Body,
    extract::{Path, State},
    http::{header, StatusCode},
    response::Response,
    routing::{delete, get, post},
    Json, Router,
};
use serde_json::json;

use crate::error::ServerError;
use crate::sandbox::types::{CreateSandboxRequest, ExecuteRequest};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sandboxes))
        .route("/", post(create_sandbox))
        .route("/:id", get(get_sandbox))
        .route("/:id/execute", post(execute_code))
        .route("/:id", delete(delete_sandbox))
}

// ── GET /sandboxes ────────────────────────────────────────────────────────────

/// List all active sandbox containers.
async fn list_sandboxes(State(state): State<AppState>) -> Result<Json<serde_json::Value>, ServerError> {
    let sandboxes = state.sandbox_manager.list_sandboxes().await;
    Ok(Json(json!({ "sandboxes": sandboxes })))
}

// ── POST /sandboxes ───────────────────────────────────────────────────────────

/// Create a new sandbox container.
async fn create_sandbox(
    State(state): State<AppState>,
    Json(body): Json<CreateSandboxRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ServerError> {
    let info = state
        .sandbox_manager
        .create_sandbox(body)
        .await
        .map_err(ServerError::Internal)?;

    Ok((StatusCode::CREATED, Json(json!(info))))
}

// ── GET /sandboxes/:id ────────────────────────────────────────────────────────

/// Get information about a specific sandbox.
async fn get_sandbox(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let info = state
        .sandbox_manager
        .get_sandbox(&id)
        .await
        .ok_or_else(|| ServerError::NotFound(format!("Sandbox not found: {id}")))?;

    Ok(Json(json!(info)))
}

// ── POST /sandboxes/:id/execute ───────────────────────────────────────────────

/// Execute code inside a sandbox and stream back the results as NDJSON.
///
/// The response is a stream of newline-delimited JSON objects, each one being a
/// `SandboxOutputEvent` (`{"text": "..."}`, `{"image": "..."}`, or `{"error": "..."}`).
async fn execute_code(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<ExecuteRequest>,
) -> Result<Response<Body>, ServerError> {
    let upstream = state
        .sandbox_manager
        .execute_in_sandbox(&id, body)
        .await
        .map_err(|e| {
            // Distinguish "not found" from other errors.
            if e.contains("not found") || e.contains("not Found") {
                ServerError::NotFound(e)
            } else {
                ServerError::Internal(e)
            }
        })?;

    // Convert reqwest streaming bytes into an axum streaming body.
    let byte_stream = upstream.bytes_stream();
    let body = Body::from_stream(byte_stream);

    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, "application/x-ndjson")
        .body(body)
        .map_err(|e| ServerError::Internal(e.to_string()))
}

// ── DELETE /sandboxes/:id ─────────────────────────────────────────────────────

/// Stop and remove a sandbox container.
async fn delete_sandbox(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    state
        .sandbox_manager
        .delete_sandbox(&id)
        .await
        .map_err(|e| {
            if e.contains("not found") {
                ServerError::NotFound(e)
            } else {
                ServerError::Internal(e)
            }
        })?;

    Ok(Json(json!({ "message": format!("Sandbox {id} deleted") })))
}
