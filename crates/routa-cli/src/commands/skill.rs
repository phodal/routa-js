//! `routa skill` — Skill discovery commands.

use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

use super::print_json;

pub async fn list(state: &AppState) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "skills.list"
        }))
        .await;
    print_json(&response);
    Ok(())
}

pub async fn reload(state: &AppState) -> Result<(), String> {
    let router = RpcRouter::new(state.clone());
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "skills.reload"
        }))
        .await;
    print_json(&response);
    Ok(())
}
