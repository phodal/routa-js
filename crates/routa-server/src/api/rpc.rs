//! JSON-RPC 2.0 endpoint powered by `crate::rpc`.
//!
//! Exposes `POST /api/rpc` — a single endpoint for all JSON-RPC method calls.
//! Also exposes `GET /api/rpc/methods` for method discovery.

use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};

use crate::rpc::RpcRouter;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", post(rpc_handler))
        .route("/methods", get(list_methods))
}

/// POST /api/rpc — JSON-RPC 2.0 endpoint.
///
/// Accepts a JSON-RPC request (single or batch) and returns the response.
async fn rpc_handler(
    State(state): State<AppState>,
    Json(body): Json<serde_json::Value>,
) -> Json<serde_json::Value> {
    let rpc = RpcRouter::new(state);
    let response = rpc.handle_value(body).await;
    Json(response)
}

/// GET /api/rpc/methods — list all supported JSON-RPC method names.
async fn list_methods(State(state): State<AppState>) -> Json<serde_json::Value> {
    let rpc = RpcRouter::new(state);
    let methods = rpc.method_list();
    Json(serde_json::json!({ "methods": methods }))
}
