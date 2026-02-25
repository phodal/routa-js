//! `routa chat` — Interactive chat session with an agent.
//!
//! Creates an ACP session and provides a REPL-style interface for
//! sending prompts and receiving responses, mirroring the Next.js
//! ChatPanel experience from the homepage.

use std::io::{self, BufRead, Write};
use std::sync::Arc;

use routa_core::models::agent::AgentRole;
use routa_core::orchestration::{OrchestratorConfig, RoutaOrchestrator};
use routa_core::rpc::RpcRouter;
use routa_core::state::AppState;

pub async fn run(
    state: &AppState,
    workspace_id: &str,
    provider: &str,
    role: &str,
) -> Result<(), String> {
    let _agent_role = AgentRole::from_str(role)
        .ok_or_else(|| format!("Invalid role: {}. Use ROUTA, CRAFTER, GATE, or DEVELOPER", role))?;

    let router = RpcRouter::new(state.clone());

    // Create agent for this chat session via RPC
    let agent_name = format!("cli-{}", role.to_lowercase());
    let create_response = router
        .handle_value(serde_json::json!({
            "jsonrpc": "2.0",
            "id": 1,
            "method": "agents.create",
            "params": {
                "name": agent_name,
                "role": role,
                "workspaceId": workspace_id
            }
        }))
        .await;

    let agent_id = create_response
        .get("result")
        .and_then(|r| r.get("agentId"))
        .and_then(|v| v.as_str())
        .ok_or("Failed to get agent ID from creation result")?
        .to_string();

    println!("Routa CLI Chat");
    println!("══════════════════════════════════════");
    println!("Agent: {} ({})", agent_name, role);
    println!("Agent ID: {}", agent_id);
    println!("Workspace: {}", workspace_id);
    println!("Provider: {}", provider);
    println!("══════════════════════════════════════");

    // Create ACP session
    let session_id = uuid::Uuid::new_v4().to_string();
    let cwd = std::env::current_dir()
        .map(|p| p.to_string_lossy().to_string())
        .unwrap_or_else(|_| ".".to_string());

    let spawn_result = state
        .acp_manager
        .create_session(
            session_id.clone(),
            cwd.clone(),
            workspace_id.to_string(),
            Some(provider.to_string()),
            Some(role.to_string()),
            None,
        )
        .await;

    match spawn_result {
        Ok((sid, _)) => {
            println!("Session started: {}", sid);

            // Register with orchestrator
            let acp = Arc::new(state.acp_manager.clone());
            let orchestrator = RoutaOrchestrator::new(
                OrchestratorConfig::default(),
                acp,
                state.agent_store.clone(),
                state.task_store.clone(),
                state.event_bus.clone(),
            );
            orchestrator
                .register_agent_session(&agent_id, &session_id)
                .await;
        }
        Err(e) => {
            println!("Note: Could not create ACP session ({}). Running in offline mode.", e);
            println!("Commands will still work for agent/task/workspace management.");
        }
    }

    println!();
    println!("Type your message and press Enter. Type /quit to exit.");
    println!("Commands: /agents, /tasks, /status, /quit");
    println!();

    let stdin = io::stdin();
    let reader = stdin.lock();

    for line in reader.lines() {
        let line = line.map_err(|e| format!("Failed to read input: {}", e))?;
        let trimmed = line.trim();

        if trimmed.is_empty() {
            continue;
        }

        match trimmed {
            "/quit" | "/exit" | "/q" => {
                println!("Goodbye!");
                state.acp_manager.kill_session(&session_id).await;
                break;
            }
            "/agents" => {
                let response = router
                    .handle_value(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "agents.list",
                        "params": { "workspaceId": workspace_id }
                    }))
                    .await;
                if let Some(result) = response.get("result") {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(result).unwrap_or_default()
                    );
                }
            }
            "/tasks" => {
                let response = router
                    .handle_value(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "tasks.list",
                        "params": { "workspaceId": workspace_id }
                    }))
                    .await;
                if let Some(result) = response.get("result") {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(result).unwrap_or_default()
                    );
                }
            }
            "/status" => {
                let response = router
                    .handle_value(serde_json::json!({
                        "jsonrpc": "2.0",
                        "id": 1,
                        "method": "agents.get",
                        "params": { "id": agent_id }
                    }))
                    .await;
                if let Some(result) = response.get("result") {
                    println!(
                        "{}",
                        serde_json::to_string_pretty(result).unwrap_or_default()
                    );
                }
            }
            _ => {
                // Send prompt to ACP session
                print!("Sending prompt...");
                io::stdout().flush().ok();

                match state.acp_manager.prompt(&session_id, trimmed).await {
                    Ok(_) => {
                        println!(" sent.");
                        println!("(Agent is processing. Use /status to check progress.)");
                    }
                    Err(e) => {
                        println!();
                        println!("Failed to send prompt: {}", e);
                        println!("(ACP session may not be active. Agent/task commands still work.)");
                    }
                }
            }
        }

        print!("\n> ");
        io::stdout().flush().ok();
    }

    Ok(())
}
