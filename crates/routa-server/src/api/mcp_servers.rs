//! Custom MCP Servers API - /api/mcp-servers
//!
//! REST API for managing user-defined MCP server configurations.
//! These are merged with the built-in routa-coordination server
//! when spawning ACP provider processes.
//!
//! GET    /api/mcp-servers              - List all custom MCP servers
//! GET    /api/mcp-servers?id=<id>      - Get a specific MCP server
//! POST   /api/mcp-servers              - Create a new MCP server
//! PUT    /api/mcp-servers              - Update an existing MCP server
//! DELETE /api/mcp-servers?id=<id>      - Delete a MCP server

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::models::custom_mcp_server::{CreateCustomMcpServerInput, UpdateCustomMcpServerInput};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_or_get).post(create_server).put(update_server).delete(delete_server))
}

// ─── Query params ─────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    id: Option<String>,
    workspace_id: Option<String>,
}

// ─── GET /api/mcp-servers ─────────────────────────────────────────────────

async fn list_or_get(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if let Some(id) = q.id {
        // Return single server
        match state.custom_mcp_server_store.get(&id).await? {
            Some(server) => return Ok(Json(serde_json::json!(server))),
            None => {
                return Err(ServerError::NotFound(format!("MCP server '{}' not found", id)))
            }
        }
    }

    let servers = state
        .custom_mcp_server_store
        .list(q.workspace_id.as_deref())
        .await?;
    Ok(Json(serde_json::json!({ "servers": servers })))
}

// ─── POST /api/mcp-servers ────────────────────────────────────────────────

async fn create_server(
    State(state): State<AppState>,
    Json(body): Json<CreateCustomMcpServerInput>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Validate required fields
    if body.id.is_empty() || body.name.is_empty() {
        return Err(ServerError::BadRequest(
            "Missing required fields: id, name".into(),
        ));
    }

    use crate::models::custom_mcp_server::McpServerType;
    match body.server_type {
        McpServerType::Stdio if body.command.is_none() => {
            return Err(ServerError::BadRequest(
                "stdio type requires a command".into(),
            ));
        }
        McpServerType::Http | McpServerType::Sse if body.url.is_none() => {
            return Err(ServerError::BadRequest(
                "http/sse type requires a url".into(),
            ));
        }
        _ => {}
    }

    let server = state.custom_mcp_server_store.create(body).await?;
    Ok(Json(serde_json::json!({
        "server": server,
        "message": "MCP server created successfully"
    })))
}

// ─── PUT /api/mcp-servers ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct UpdateBody {
    id: String,
    #[serde(flatten)]
    input: UpdateCustomMcpServerInput,
}

async fn update_server(
    State(state): State<AppState>,
    Json(body): Json<UpdateBody>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if body.id.is_empty() {
        return Err(ServerError::BadRequest("Missing required field: id".into()));
    }

    match state
        .custom_mcp_server_store
        .update(&body.id, body.input)
        .await?
    {
        Some(server) => Ok(Json(serde_json::json!({
            "server": server,
            "message": "MCP server updated successfully"
        }))),
        None => Err(ServerError::NotFound(format!(
            "MCP server '{}' not found",
            body.id
        ))),
    }
}

// ─── DELETE /api/mcp-servers ──────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct DeleteQuery {
    id: Option<String>,
}

async fn delete_server(
    State(state): State<AppState>,
    Query(q): Query<DeleteQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let id = q
        .id
        .ok_or_else(|| ServerError::BadRequest("Missing required parameter: id".into()))?;

    let deleted = state.custom_mcp_server_store.delete(&id).await?;

    if !deleted {
        return Err(ServerError::NotFound(format!(
            "MCP server '{}' not found",
            id
        )));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "MCP server deleted successfully"
    })))
}
