//! `routa workspace` — Workspace management commands.

use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

use super::print_json;

pub async fn list(state: &AppState) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "workspaces.list"
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn create(state: &AppState, name: &str) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "workspaces.create",
            "params": { "name": name }
        }))
        .await;
    print_json(&response);
    Ok(())
}
