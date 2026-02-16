use axum::{
    extract::{Query, State},
    response::sse::{Event, KeepAlive, Sse},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use std::convert::Infallible;
use tokio_stream::StreamExt as _;

use crate::server::acp;
use crate::server::error::ServerError;
use crate::server::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(acp_sse).post(acp_rpc))
}

/// POST /api/acp — Handle ACP JSON-RPC requests.
/// Compatible with the Next.js frontend's acp-client.ts.
async fn acp_rpc(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let method = body
        .get("method")
        .and_then(|m| m.as_str())
        .unwrap_or("");
    let id = body.get("id").cloned().unwrap_or(serde_json::json!(null));

    match method {
        "initialize" => Ok(Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "result": {
                "name": "routa-desktop",
                "version": env!("CARGO_PKG_VERSION"),
                "capabilities": {
                    "sessions": true,
                    "prompts": true
                }
            }
        }))),

        "_providers/list" => {
            let presets = acp::get_presets();
            Ok(Json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "providers": presets
                }
            })))
        }

        "session/new" => {
            let params = body.get("params").cloned().unwrap_or_default();
            let cwd = params
                .get("cwd")
                .and_then(|v| v.as_str())
                .unwrap_or(".")
                .to_string();
            let provider = params
                .get("provider")
                .and_then(|v| v.as_str())
                .map(|s| s.to_string());
            let session_id = uuid::Uuid::new_v4().to_string();

            let session = state
                .acp_manager
                .create_session(session_id.clone(), cwd, "default".to_string(), provider)
                .await;

            Ok(Json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": {
                    "sessionId": session.session_id,
                    "status": "created"
                }
            })))
        }

        "session/cancel" => {
            let params = body.get("params").cloned().unwrap_or_default();
            if let Some(sid) = params.get("sessionId").and_then(|v| v.as_str()) {
                state.acp_manager.remove_session(sid).await;
            }
            Ok(Json(serde_json::json!({
                "jsonrpc": "2.0",
                "id": id,
                "result": { "cancelled": true }
            })))
        }

        _ => Ok(Json(serde_json::json!({
            "jsonrpc": "2.0",
            "id": id,
            "error": {
                "code": -32601,
                "message": format!("Method '{}' not yet implemented in Rust backend", method)
            }
        }))),
    }
}

/// GET /api/acp?sessionId=xxx — SSE stream for session updates.
/// Compatible with the Next.js frontend's acp-client.ts EventSource.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AcpSseQuery {
    #[allow(dead_code)]
    session_id: Option<String>,
}

async fn acp_sse(
    Query(_query): Query<AcpSseQuery>,
) -> Sse<impl tokio_stream::Stream<Item = Result<Event, Infallible>>> {
    let stream = tokio_stream::wrappers::IntervalStream::new(tokio::time::interval(
        std::time::Duration::from_secs(15),
    ))
    .map(|_| Ok(Event::default().comment("heartbeat")));

    Sse::new(stream).keep_alive(KeepAlive::default())
}
