//! Integration tests for the routa-cli commands.
//!
//! These tests verify that the CLI commands work correctly by
//! exercising the same code paths as the binary, using in-memory
//! SQLite databases for isolation.

use std::sync::Arc;

use routa_core::rpc::RpcRouter;
use routa_core::state::{AppState, AppStateInner};
use routa_core::Database;

/// Create an in-memory AppState for testing.
async fn test_state() -> AppState {
    let db = Database::open(":memory:").expect("Failed to open in-memory database");
    let state: AppState = Arc::new(AppStateInner::new(db));
    state
        .workspace_store
        .ensure_default()
        .await
        .expect("Failed to initialize default workspace");
    state
}

#[tokio::test]
async fn test_workspace_list() {
    let state = test_state().await;
    let router = RpcRouter::new(state);
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "workspaces.list"
        }))
        .await;

    let result = response.get("result").expect("Expected result field");
    let workspaces = result.get("workspaces").expect("Expected workspaces array");
    assert!(workspaces.is_array());
    assert!(!workspaces.as_array().unwrap().is_empty());

    let default_ws = &workspaces.as_array().unwrap()[0];
    assert_eq!(default_ws["id"], "default");
    assert_eq!(default_ws["title"], "Default Workspace");
}

#[tokio::test]
async fn test_agent_create_and_list() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    // Create agent
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.create",
            "params": {
                "name": "test-crafter",
                "role": "CRAFTER",
                "workspaceId": "default"
            }
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    let agent_id = result.get("agentId").expect("Expected agentId");
    assert!(agent_id.is_string());

    let agent = result.get("agent").expect("Expected agent");
    assert_eq!(agent["name"], "test-crafter");
    assert_eq!(agent["role"], "CRAFTER");
    assert_eq!(agent["status"], "PENDING");

    // List agents
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "agents.list",
            "params": { "workspaceId": "default" }
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    let agents = result.get("agents").expect("Expected agents");
    assert_eq!(agents.as_array().unwrap().len(), 1);
    assert_eq!(agents[0]["name"], "test-crafter");
}

#[tokio::test]
async fn test_task_create_and_list() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    // Create task
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.create",
            "params": {
                "title": "Test Task",
                "objective": "Verify CLI works",
                "workspaceId": "default"
            }
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    let task = result.get("task").expect("Expected task");
    assert_eq!(task["title"], "Test Task");
    assert_eq!(task["objective"], "Verify CLI works");
    assert_eq!(task["status"], "PENDING");

    let task_id = task["id"].as_str().unwrap();

    // Get task
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tasks.get",
            "params": { "id": task_id }
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    assert_eq!(result["title"], "Test Task");

    // List tasks
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tasks.list",
            "params": { "workspaceId": "default" }
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    let tasks = result.get("tasks").expect("Expected tasks");
    assert_eq!(tasks.as_array().unwrap().len(), 1);
}

#[tokio::test]
async fn test_task_update_status() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    // Create task
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "tasks.create",
            "params": {
                "title": "Status Test",
                "objective": "Test status updates"
            }
        }))
        .await;

    let task_id = response["result"]["task"]["id"].as_str().unwrap().to_string();

    // Update status
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "tasks.updateStatus",
            "params": {
                "id": task_id,
                "status": "IN_PROGRESS"
            }
        }))
        .await;

    assert_eq!(response["result"]["updated"], true);

    // Verify status changed
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 3,
            "method": "tasks.get",
            "params": { "id": task_id }
        }))
        .await;

    assert_eq!(response["result"]["status"], "IN_PROGRESS");
}

#[tokio::test]
async fn test_skills_list() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "skills.list"
        }))
        .await;

    let result = response.get("result").expect("Expected result");
    assert!(result.get("skills").is_some());
}

#[tokio::test]
async fn test_rpc_method_not_found() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "nonexistent.method"
        }))
        .await;

    assert!(response.get("error").is_some());
    assert_eq!(response["error"]["code"], -32601);
}

#[tokio::test]
async fn test_agent_roles() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    // Test creating agents with all valid roles
    for role in &["ROUTA", "CRAFTER", "GATE", "DEVELOPER"] {
        let response = router
            .handle_value(serde_json::json!({
                "jsonrpc": "2.0",
                "id": 1,
                "method": "agents.create",
                "params": {
                    "name": format!("test-{}", role.to_lowercase()),
                    "role": role,
                    "workspaceId": "default"
                }
            }))
            .await;

        assert!(
            response.get("result").is_some(),
            "Failed to create agent with role {}",
            role
        );
        assert_eq!(response["result"]["agent"]["role"], *role);
    }

    // List should show all 4 agents
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "agents.list",
            "params": { "workspaceId": "default" }
        }))
        .await;

    assert_eq!(response["result"]["agents"].as_array().unwrap().len(), 4);
}

#[tokio::test]
async fn test_workspace_create() {
    let state = test_state().await;
    let router = RpcRouter::new(state);

    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "workspaces.create",
            "params": { "title": "my-project" }
        }))
        .await;

    assert!(response.get("result").is_some());

    // List should show default + new workspace
    let response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "workspaces.list"
        }))
        .await;

    let workspaces = response["result"]["workspaces"].as_array().unwrap();
    assert!(workspaces.len() >= 2);
}
