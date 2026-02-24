//! `routa delegate` — Delegate a task to a specialist agent with ACP spawning.

use std::sync::Arc;

use routa_core::orchestration::{DelegateWithSpawnParams, OrchestratorConfig, RoutaOrchestrator};
use routa_core::state::AppState;

use super::print_json;

#[allow(clippy::too_many_arguments)]
pub async fn run(
    state: &AppState,
    task_id: &str,
    caller_agent_id: &str,
    caller_session_id: &str,
    workspace_id: &str,
    specialist: &str,
    provider: Option<&str>,
    cwd: Option<&str>,
    wait_mode: &str,
) -> Result<(), String> {
    let acp = Arc::new(state.acp_manager.clone());
    let orchestrator = RoutaOrchestrator::new(
        OrchestratorConfig::default(),
        acp,
        state.agent_store.clone(),
        state.task_store.clone(),
        state.event_bus.clone(),
    );

    let params = DelegateWithSpawnParams {
        task_id: task_id.to_string(),
        caller_agent_id: caller_agent_id.to_string(),
        caller_session_id: caller_session_id.to_string(),
        workspace_id: workspace_id.to_string(),
        specialist: specialist.to_string(),
        provider: provider.map(|s| s.to_string()),
        cwd: cwd.map(|s| s.to_string()),
        additional_instructions: None,
        wait_mode: wait_mode.to_string(),
    };

    let result = orchestrator
        .delegate_task_with_spawn(params)
        .await
        .map_err(|e| e.to_string())?;

    print_json(&serde_json::to_value(&result).unwrap());
    Ok(())
}
