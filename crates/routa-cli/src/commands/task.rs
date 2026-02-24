//! `routa task` — Task management commands.

use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

use super::print_json;

pub async fn list(state: &AppState, workspace_id: &str) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.list",
            "params": { "workspaceId": workspace_id }
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn create(
    state: &AppState,
    title: &str,
    objective: &str,
    workspace_id: &str,
    scope: Option<&str>,
    acceptance_criteria: Option<Vec<String>>,
) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let mut params = serde_json::json!({
        "title": title,
        "objective": objective,
        "workspaceId": workspace_id
    });
    if let Some(s) = scope {
        params["scope"] = serde_json::json!(s);
    }
    if let Some(ac) = acceptance_criteria {
        params["acceptanceCriteria"] = serde_json::json!(ac);
    }
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.create",
            "params": params
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn get(state: &AppState, task_id: &str) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.get",
            "params": { "id": task_id }
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn update_status(
    state: &AppState,
    task_id: &str,
    status: &str,
    _agent_id: &str,
    _summary: Option<&str>,
) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.updateStatus",
            "params": {
                "id": task_id,
                "status": status
            }
        }))
        .await;
    print_json(&response);
    Ok(())
}
