//! `routa agent` — Agent management commands.

use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

use super::print_json;

pub async fn list(state: &AppState, workspace_id: &str) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.list",
            "params": { "workspaceId": workspace_id }
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn create(
    state: &AppState,
    name: &str,
    role: &str,
    workspace_id: &str,
    parent_id: Option<&str>,
) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let mut params = serde_json::json!({
        "name": name,
        "role": role,
        "workspaceId": workspace_id
    });
    if let Some(pid) = parent_id {
        params["parentId"] = serde_json::json!(pid);
    }
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.create",
            "params": params
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn status(state: &AppState, agent_id: &str) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.get",
            "params": { "id": agent_id }
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn summary(state: &AppState, agent_id: &str) -> Result<(), String> {
    // Agent summary uses agents.get since there's no separate summary RPC method
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.get",
            "params": { "id": agent_id }
        }))
        .await;
    print_json(&response);
    Ok(())
}
