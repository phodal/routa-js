use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_sessions))
        .route("/{session_id}", get(get_session).patch(rename_session).delete(delete_session))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListSessionsQuery {
    workspace_id: Option<String>,
    limit: Option<usize>,
}

/// GET /api/sessions — List ACP sessions.
/// Compatible with the Next.js frontend's session-panel.tsx and chat-panel.tsx.
async fn list_sessions(
    State(state): State<AppState>,
    Query(query): Query<ListSessionsQuery>,
) -> Json<serde_json::Value> {
    let mut sessions = state.acp_manager.list_sessions().await;

    // Filter by workspace if specified
    if let Some(workspace_id) = &query.workspace_id {
        sessions.retain(|s| &s.workspace_id == workspace_id);
    }

    // Limit results if specified
    if let Some(limit) = query.limit {
        sessions.truncate(limit);
    }

    Json(serde_json::json!({ "sessions": sessions }))
}

/// GET /api/sessions/{session_id} — Get session metadata.
async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let session = state
        .acp_manager
        .get_session(&session_id)
        .await
        .ok_or_else(|| ServerError::NotFound("Session not found".to_string()))?;

    Ok(Json(serde_json::json!({
        "session": {
            "sessionId": session.session_id,
            "name": session.name,
            "cwd": session.cwd,
            "workspaceId": session.workspace_id,
            "routaAgentId": session.routa_agent_id,
            "provider": session.provider,
            "role": session.role,
            "modeId": session.mode_id,
            "model": session.model,
            "createdAt": session.created_at,
        }
    })))
}

#[derive(Debug, Deserialize)]
struct RenameSessionRequest {
    name: String,
}

/// PATCH /api/sessions/{session_id} — Rename a session.
async fn rename_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Json(body): Json<RenameSessionRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let name = body.name.trim();
    if name.is_empty() {
        return Err(ServerError::BadRequest("Invalid name".to_string()));
    }

    state
        .acp_manager
        .rename_session(&session_id, name)
        .await
        .ok_or_else(|| ServerError::NotFound("Session not found".to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// DELETE /api/sessions/{session_id} — Delete a session.
async fn delete_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    state
        .acp_manager
        .delete_session(&session_id)
        .await
        .ok_or_else(|| ServerError::NotFound("Session not found".to_string()))?;

    Ok(Json(serde_json::json!({ "ok": true })))
}
