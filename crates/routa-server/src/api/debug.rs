use axum::{routing::get, Json, Router};
use serde_json::{json, Value};

use crate::state::AppState;
use routa_core::shell_env;

/// Debug endpoint to check PATH and command resolution
async fn debug_path() -> Json<Value> {
    let full_path = shell_env::full_path();
    let claude_path = shell_env::which("claude");
    let opencode_path = shell_env::which("opencode");
    
    Json(json!({
        "full_path": full_path,
        "path_entries": full_path.split(':').collect::<Vec<_>>(),
        "claude": claude_path,
        "opencode": opencode_path,
        "env_path": std::env::var("PATH").ok(),
    }))
}

pub fn router() -> Router<AppState> {
    Router::new().route("/path", get(debug_path))
}

