//! ACP/provider execution primitives for `routa review`.

use std::time::Duration;

use routa_core::state::AppState;

use super::stream_parser::{extract_agent_output_from_history, extract_update_text, update_contains_turn_complete};

pub(crate) async fn wait_for_turn_complete_with_updates(
    state: &AppState,
    session_id: &str,
    rx: &mut tokio::sync::broadcast::Receiver<serde_json::Value>,
    verbose: bool,
) -> Result<String, String> {
    let mut renderer = if verbose {
        Some(crate::commands::tui::TuiRenderer::new())
    } else {
        None
    };
    let mut collected_output = String::new();
    let mut idle_count = 0u32;
    let max_idle = 120;
    let idle_with_output_threshold = 15;

    loop {
        match tokio::time::timeout(Duration::from_secs(1), rx.recv()).await {
            Ok(Ok(update)) => {
                if let Some(renderer) = renderer.as_mut() {
                    renderer.handle_update(&update);
                }

                if let Some(text) = update
                    .get("params")
                    .and_then(|params| params.get("update"))
                    .and_then(|value| value.as_object())
                    .and_then(extract_update_text)
                {
                    collected_output.push_str(&text);
                }
                idle_count = 0;

                let is_done = update
                    .get("params")
                    .and_then(|params| params.get("update"))
                    .and_then(|update| update.get("sessionUpdate"))
                    .and_then(|value| value.as_str())
                    == Some("turn_complete");
                if is_done {
                    if let Some(renderer) = renderer.as_mut() {
                        renderer.finish();
                    }
                    return Ok(collected_output);
                }
            }
            Ok(Err(err)) => match err {
                tokio::sync::broadcast::error::RecvError::Lagged(_) => {
                    // Large sessions (for example codex-acp) can emit many updates quickly.
                    // Keep consuming the latest updates instead of terminating early.
                    idle_count = 0;
                }
                tokio::sync::broadcast::error::RecvError::Closed => {
                    if let Some(renderer) = renderer.as_mut() {
                        renderer.finish();
                    }
                    return Ok(collected_output);
                }
            },
            Err(_) => {
                idle_count += 1;
                if idle_count >= idle_with_output_threshold && !collected_output.trim().is_empty() {
                    if let Some(renderer) = renderer.as_mut() {
                        renderer.finish();
                    }
                    return Ok(collected_output);
                }
                if idle_count >= max_idle {
                    if let Some(renderer) = renderer.as_mut() {
                        renderer.finish();
                    }
                    return Ok(collected_output);
                }

                if !state.acp_manager.is_alive(session_id).await {
                    if let Some(renderer) = renderer.as_mut() {
                        renderer.finish();
                    }
                    return Ok(collected_output);
                }
            }
        }

        if let Some(history) = state.acp_manager.get_session_history(session_id).await {
            if update_contains_turn_complete(&history) {
                if let Some(renderer) = renderer.as_mut() {
                    renderer.finish();
                }
                if collected_output.trim().is_empty() {
                    return Ok(extract_agent_output_from_history(&history));
                }
                return Ok(collected_output);
            }
        } else if !state.acp_manager.is_alive(session_id).await {
            if let Some(renderer) = renderer.as_mut() {
                renderer.finish();
            }
            return Ok(collected_output);
        }
    }
}

pub(crate) async fn wait_for_turn_complete_without_updates(
    state: &AppState,
    session_id: &str,
) -> Result<(), String> {
    let mut idle_ticks = 0u32;
    let max_idle = 600;
    loop {
        match state.acp_manager.get_session_history(session_id).await {
            Some(history) if update_contains_turn_complete(&history) => return Ok(()),
            Some(_) => {}
            None => {
                return Err("Session disappeared before completion.".to_string());
            }
        }

        if !state.acp_manager.is_alive(session_id).await {
            return Ok(());
        }

        tokio::time::sleep(Duration::from_secs(1)).await;
        idle_ticks += 1;
        if idle_ticks >= max_idle {
            return Ok(());
        }
    }
}
