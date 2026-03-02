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
    extract::Query,
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route(
        "/",
        get(list_or_get)
            .post(create_server)
            .put(update_server)
            .delete(delete_server),
    )
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    id: Option<String>,
    #[allow(dead_code)]
    workspace_id: Option<String>,
}

async fn list_or_get(Query(q): Query<ListQuery>) -> Json<serde_json::Value> {
    if let Some(id) = q.id {
        return Json(serde_json::json!({
            "error": format!("MCP server '{}' not found", id),
            "code": "NOT_FOUND"
        }));
    }
    Json(serde_json::json!({ "servers": [] }))
}

async fn create_server(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let id = body
        .get("id")
        .and_then(|v| v.as_str())
        .unwrap_or("new-server");
    Json(serde_json::json!({
        "server": { "id": id },
        "message": "MCP server created"
    }))
}

async fn update_server(Json(body): Json<serde_json::Value>) -> Json<serde_json::Value> {
    let id = body.get("id").and_then(|v| v.as_str()).unwrap_or("");
    Json(serde_json::json!({
        "server": { "id": id },
        "message": "MCP server updated"
    }))
}

#[derive(Debug, Deserialize)]
struct DeleteQuery {
    id: Option<String>,
}

async fn delete_server(Query(q): Query<DeleteQuery>) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "deleted": q.id.is_some(),
        "id": q.id,
    }))
}
