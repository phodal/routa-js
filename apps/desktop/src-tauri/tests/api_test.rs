//! Integration test: start the Rust backend server and verify API endpoints.

use std::time::Duration;

#[tokio::test]
async fn test_rust_backend_api() {
    // Start server on a random port
    let config = routa_desktop_lib::server::ServerConfig {
        host: "127.0.0.1".to_string(),
        port: 0, // let OS pick a free port
        db_path: ":memory:".to_string(),
    };

    // We need to manually set up the server for testing
    let db = routa_desktop_lib::server::db::Database::open_in_memory().unwrap();
    let state: routa_desktop_lib::server::state::AppState =
        std::sync::Arc::new(routa_desktop_lib::server::state::AppStateInner::new(db));

    state.workspace_store.ensure_default().await.unwrap();

    let cors = tower_http::cors::CorsLayer::new()
        .allow_origin(tower_http::cors::Any)
        .allow_methods(tower_http::cors::Any)
        .allow_headers(tower_http::cors::Any);

    let app = axum::Router::new()
        .merge(routa_desktop_lib::server::api::api_router())
        .route(
            "/api/health",
            axum::routing::get(|| async {
                axum::Json(serde_json::json!({"status": "ok"}))
            }),
        )
        .layer(cors)
        .with_state(state);

    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let addr = listener.local_addr().unwrap();
    let base_url = format!("http://{}", addr);

    tokio::spawn(async move {
        axum::serve(listener, app).await.unwrap();
    });

    // Give server a moment to start
    tokio::time::sleep(Duration::from_millis(100)).await;

    let client = reqwest::Client::new();

    // ── Test 1: Health Check ──────────────────────────────────────
    println!("=== Test 1: Health Check ===");
    let resp = client
        .get(format!("{}/api/health", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["status"], "ok");
    println!("  PASS: {}", body);

    // ── Test 2: List Workspaces ────────────────────────────────────
    println!("=== Test 2: List Workspaces ===");
    let resp = client
        .get(format!("{}/api/workspaces", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let workspaces = body["workspaces"].as_array().unwrap();
    assert!(workspaces.len() >= 1, "Should have default workspace");
    println!("  PASS: {} workspace(s)", workspaces.len());

    // ── Test 3: List Agents (empty) ─────────────────────────────────
    println!("=== Test 3: List Agents (empty) ===");
    let resp = client
        .get(format!("{}/api/agents", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let agents = body["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 0);
    println!("  PASS: {} agents", agents.len());

    // ── Test 4: Create Agent ────────────────────────────────────────
    println!("=== Test 4: Create Agent ===");
    let resp = client
        .post(format!("{}/api/agents", base_url))
        .json(&serde_json::json!({
            "name": "Test ROUTA",
            "role": "ROUTA"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let agent_id = body["agentId"].as_str().unwrap().to_string();
    assert!(!agent_id.is_empty());
    println!("  PASS: created agent {}", agent_id);

    // ── Test 5: List Agents (should have 1) ─────────────────────────
    println!("=== Test 5: List Agents (should have 1) ===");
    let resp = client
        .get(format!("{}/api/agents", base_url))
        .send()
        .await
        .unwrap();
    let body: serde_json::Value = resp.json().await.unwrap();
    let agents = body["agents"].as_array().unwrap();
    assert_eq!(agents.len(), 1);
    assert_eq!(agents[0]["name"], "Test ROUTA");
    assert_eq!(agents[0]["role"], "ROUTA");
    println!("  PASS: {} agents, first is '{}'", agents.len(), agents[0]["name"]);

    // ── Test 6: Get Agent by query param (Next.js compatible) ───────
    println!("=== Test 6: Get Agent by ?id= ===");
    let resp = client
        .get(format!("{}/api/agents?id={}", base_url, agent_id))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["name"], "Test ROUTA");
    println!("  PASS: got agent by ?id=");

    // ── Test 7: Create Note ─────────────────────────────────────────
    println!("=== Test 7: Create Note ===");
    let resp = client
        .post(format!("{}/api/notes", base_url))
        .json(&serde_json::json!({
            "noteId": "test-note-1",
            "title": "Test Note",
            "content": "Hello from Rust backend!",
            "workspaceId": "default",
            "source": "user"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["note"]["id"], "test-note-1");
    println!("  PASS: created note '{}'", body["note"]["title"]);

    // ── Test 8: List Notes ────────────────────────────────────────
    println!("=== Test 8: List Notes ===");
    let resp = client
        .get(format!("{}/api/notes?workspaceId=default", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let notes = body["notes"].as_array().unwrap();
    assert!(notes.len() >= 1);
    println!("  PASS: {} note(s)", notes.len());

    // ── Test 9: Get Note by query param (Next.js compatible) ────────
    println!("=== Test 9: Get Note by ?noteId= ===");
    let resp = client
        .get(format!(
            "{}/api/notes?workspaceId=default&noteId=test-note-1",
            base_url
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["note"]["title"], "Test Note");
    println!("  PASS: got note by ?noteId=");

    // ── Test 10: Delete Note (Next.js compatible query params) ────
    println!("=== Test 10: Delete Note via query params ===");
    let resp = client
        .delete(format!(
            "{}/api/notes?noteId=test-note-1&workspaceId=default",
            base_url
        ))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["deleted"], true);
    println!("  PASS: deleted note via query params");

    // ── Test 11: Create Task ────────────────────────────────────────
    println!("=== Test 11: Create Task ===");
    let resp = client
        .post(format!("{}/api/tasks", base_url))
        .json(&serde_json::json!({
            "title": "Implement feature X",
            "objective": "Build the feature X module",
            "workspaceId": "default"
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["task"]["title"], "Implement feature X");
    println!("  PASS: created task");

    // ── Test 12: List Tasks ─────────────────────────────────────────
    println!("=== Test 12: List Tasks ===");
    let resp = client
        .get(format!("{}/api/tasks?workspaceId=default", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let tasks = body["tasks"].as_array().unwrap();
    assert_eq!(tasks.len(), 1);
    println!("  PASS: {} task(s)", tasks.len());

    // ── Test 13: Skills ─────────────────────────────────────────────
    println!("=== Test 13: List Skills ===");
    let resp = client
        .get(format!("{}/api/skills", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    println!("  PASS: {} skills", body["skills"].as_array().unwrap().len());

    // ── Test 14: ACP Sessions ───────────────────────────────────────
    println!("=== Test 14: ACP Sessions ===");
    let resp = client
        .get(format!("{}/api/sessions", base_url))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert!(body["sessions"].as_array().is_some());
    println!("  PASS: sessions endpoint works");

    // ── Test 15: ACP JSON-RPC ───────────────────────────────────────
    println!("=== Test 15: ACP JSON-RPC ===");
    let resp = client
        .post(format!("{}/api/acp", base_url))
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "initialize",
            "params": {}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    assert_eq!(body["result"]["name"], "routa-desktop");
    println!("  PASS: ACP initialize works");

    // ── Test 16: ACP providers list ─────────────────────────────────
    println!("=== Test 16: ACP Providers List ===");
    let resp = client
        .post(format!("{}/api/acp", base_url))
        .json(&serde_json::json!({
            "jsonrpc": "2.0",
            "id": 2,
            "method": "_providers/list",
            "params": {}
        }))
        .send()
        .await
        .unwrap();
    assert_eq!(resp.status(), 200);
    let body: serde_json::Value = resp.json().await.unwrap();
    let providers = body["result"]["providers"].as_array().unwrap();
    assert!(providers.len() >= 4);
    println!("  PASS: {} providers", providers.len());

    println!("\n=== ALL 16 TESTS PASSED ===");
}
