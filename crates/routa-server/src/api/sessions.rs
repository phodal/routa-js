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
        .route("/{session_id}/history", get(get_session_history))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListSessionsQuery {
    workspace_id: Option<String>,
    limit: Option<usize>,
}

/// GET /api/sessions — List ACP sessions.
/// Compatible with the Next.js frontend's session-panel.tsx and chat-panel.tsx.
///
/// Merges in-memory sessions with persisted sessions from the database.
async fn list_sessions(
    State(state): State<AppState>,
    Query(query): Query<ListSessionsQuery>,
) -> Json<serde_json::Value> {
    // Get in-memory sessions
    let in_memory_sessions = state.acp_manager.list_sessions().await;

    // Get session IDs currently in memory
    let in_memory_ids: std::collections::HashSet<String> =
        in_memory_sessions.iter().map(|s| s.session_id.clone()).collect();

    // Convert in-memory sessions to JSON values
    let mut sessions: Vec<serde_json::Value> = in_memory_sessions
        .into_iter()
        .filter(|s| {
            // Filter by workspace if specified
            query
                .workspace_id
                .as_ref()
                .map_or(true, |ws| &s.workspace_id == ws)
        })
        .map(|s| serde_json::to_value(s).unwrap_or_default())
        .collect();

    // Load sessions from database and merge
    if let Ok(db_sessions) = state
        .acp_session_store
        .list(query.workspace_id.as_deref(), query.limit)
        .await
    {
        for db_session in db_sessions {
            if !in_memory_ids.contains(&db_session.id) {
                sessions.push(serde_json::json!({
                    "sessionId": db_session.id,
                    "name": db_session.name,
                    "cwd": db_session.cwd,
                    "workspaceId": db_session.workspace_id,
                    "routaAgentId": db_session.routa_agent_id,
                    "provider": db_session.provider,
                    "role": db_session.role,
                    "modeId": db_session.mode_id,
                    "createdAt": db_session.created_at,
                }));
            }
        }
    }

    // Sort by createdAt descending (handle both string and integer formats)
    sessions.sort_by(|a, b| {
        let a_time = a
            .get("createdAt")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis()))))
            .unwrap_or(0);
        let b_time = b
            .get("createdAt")
            .and_then(|v| v.as_i64().or_else(|| v.as_str().and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok().map(|d| d.timestamp_millis()))))
            .unwrap_or(0);
        b_time.cmp(&a_time)
    });

    // Limit results if specified
    if let Some(limit) = query.limit {
        sessions.truncate(limit);
    }

    Json(serde_json::json!({ "sessions": sessions }))
}

/// GET /api/sessions/{session_id} — Get session metadata.
///
/// First tries to get session from in-memory AcpManager.
/// Falls back to database if session is not in memory (e.g. after server restart).
async fn get_session(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Try in-memory session first
    if let Some(session) = state.acp_manager.get_session(&session_id).await {
        return Ok(Json(serde_json::json!({
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
        })));
    }

    // Fall back to database
    let db_session = state
        .acp_session_store
        .get(&session_id)
        .await?
        .ok_or_else(|| ServerError::NotFound("Session not found".to_string()))?;

    Ok(Json(serde_json::json!({
        "session": {
            "sessionId": db_session.id,
            "name": db_session.name,
            "cwd": db_session.cwd,
            "workspaceId": db_session.workspace_id,
            "routaAgentId": db_session.routa_agent_id,
            "provider": db_session.provider,
            "role": db_session.role,
            "modeId": db_session.mode_id,
            "model": null,
            "createdAt": db_session.created_at,
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HistoryQuery {
    consolidated: Option<bool>,
}

/// GET /api/sessions/{session_id}/history — Get session message history.
///
/// First tries to get history from in-memory AcpManager.
/// Falls back to database if in-memory is empty (e.g. after server restart).
async fn get_session_history(
    State(state): State<AppState>,
    Path(session_id): Path<String>,
    Query(query): Query<HistoryQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Try in-memory history first
    let mut history = state
        .acp_manager
        .get_session_history(&session_id)
        .await
        .unwrap_or_default();

    // Fall back to database if in-memory is empty
    if history.is_empty() {
        history = state
            .acp_session_store
            .get_history(&session_id)
            .await
            .unwrap_or_default();

        // Populate in-memory store for subsequent requests
        if !history.is_empty() {
            for notification in &history {
                state
                    .acp_manager
                    .push_to_history(&session_id, notification.clone())
                    .await;
            }
        }
    }

    // Consolidate if requested (merge consecutive agent_message_chunk into single messages)
    let result = if query.consolidated.unwrap_or(false) {
        consolidate_message_history(history)
    } else {
        history
    };

    Ok(Json(serde_json::json!({ "history": result })))
}

/// Consolidates consecutive agent_message_chunk notifications into a single message.
/// This reduces storage overhead from hundreds of small chunks to a single entry.
fn consolidate_message_history(notifications: Vec<serde_json::Value>) -> Vec<serde_json::Value> {
    if notifications.is_empty() {
        return vec![];
    }

    let mut result: Vec<serde_json::Value> = Vec::new();
    let mut current_chunks: Vec<String> = Vec::new();
    let mut current_session_id: Option<String> = None;

    let flush_chunks = |result: &mut Vec<serde_json::Value>,
                        chunks: &mut Vec<String>,
                        session_id: &Option<String>| {
        if !chunks.is_empty() {
            if let Some(sid) = session_id {
                result.push(serde_json::json!({
                    "sessionId": sid,
                    "update": {
                        "sessionUpdate": "agent_message",
                        "content": { "type": "text", "text": chunks.join("") }
                    }
                }));
            }
            chunks.clear();
        }
    };

    for notification in notifications {
        let session_id = notification
            .get("sessionId")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let session_update = notification
            .get("update")
            .and_then(|u| u.get("sessionUpdate"))
            .and_then(|v| v.as_str());

        if session_update == Some("agent_message_chunk") {
            // Accumulate chunks
            let text = notification
                .get("update")
                .and_then(|u| u.get("content"))
                .and_then(|c| c.get("text"))
                .and_then(|t| t.as_str());

            if let Some(text) = text {
                if current_session_id != session_id {
                    flush_chunks(&mut result, &mut current_chunks, &current_session_id);
                    current_session_id = session_id;
                }
                current_chunks.push(text.to_string());
            }
        } else {
            // Non-chunk notification - flush any pending chunks first
            flush_chunks(&mut result, &mut current_chunks, &current_session_id);
            current_session_id = session_id;
            result.push(notification);
        }
    }

    // Flush any remaining chunks
    flush_chunks(&mut result, &mut current_chunks, &current_session_id);

    result
}
