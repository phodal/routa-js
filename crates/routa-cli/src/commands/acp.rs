//! `routa acp` — ACP agent management commands.
//!
//! Provides:
//!   - `routa acp install <agent_id>` — install an agent (download runtime if needed)
//!   - `routa acp uninstall <agent_id>` — remove an installed agent
//!   - `routa acp list` — list agents from the registry with installation status
//!   - `routa acp installed` — list locally installed agents
//!   - `routa acp runtime status` — show Node.js / uv runtime health

use routa_core::acp::runtime_manager::{RuntimeType, current_platform};
use routa_core::acp::{AcpPaths, DistributionType, fetch_registry_json};
use routa_core::state::AppState;

use super::print_json;

// ─── Install ──────────────────────────────────────────────────────────────

/// `routa acp install <agent_id> [--dist <npx|uvx|binary>]`
///
/// 1. Fetch the ACP registry.
/// 2. Resolve distribution type (honours explicit `--dist` flag).
/// 3. For `npx` / `uvx`: ensure the runtime is present, downloading if needed.
/// 4. For `binary`: delegate to `AcpBinaryManager`.
/// 5. Persist installation state.
pub async fn install(
    state: &AppState,
    agent_id: &str,
    dist_override: Option<&str>,
) -> Result<(), String> {
    println!("[acp install] Fetching registry…");

    let registry_json = fetch_registry_json().await?;
    let agent = find_agent(&registry_json, agent_id)?;

    let name = agent.get("name").and_then(|v| v.as_str()).unwrap_or(agent_id);
    let version = agent
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("latest")
        .to_string();

    let dist = agent
        .get("distribution")
        .cloned()
        .unwrap_or(serde_json::Value::Object(Default::default()));

    // Determine the best distribution type
    let dist_type = if let Some(explicit) = dist_override {
        explicit.to_string()
    } else {
        choose_dist_type(&dist)
    };

    println!("[acp install] Installing '{}' v{} via {}", name, version, dist_type);

    match dist_type.as_str() {
        "npx" => {
            install_npx(state, agent_id, name, &version, &dist).await?;
        }
        "uvx" => {
            install_uvx(state, agent_id, name, &version, &dist).await?;
        }
        "binary" => {
            install_binary(state, agent_id, name, &version, &dist).await?;
        }
        other => {
            return Err(format!("Unknown distribution type '{}'. Use npx, uvx, or binary.", other));
        }
    }

    print_json(&serde_json::json!({
        "success": true,
        "agentId": agent_id,
        "name": name,
        "version": version,
        "distributionType": dist_type,
    }));
    Ok(())
}

// ─── Uninstall ────────────────────────────────────────────────────────────

pub async fn uninstall(state: &AppState, agent_id: &str) -> Result<(), String> {
    println!("[acp uninstall] Removing '{}'…", agent_id);

    if let Some(info) = state.acp_installation_state.get_installed_info(agent_id).await {
        if info.dist_type == DistributionType::Binary {
            state
                .acp_binary_manager
                .uninstall(agent_id)
                .await
                .map_err(|e| format!("Binary removal failed: {}", e))?;
        }
    }

    state
        .acp_installation_state
        .uninstall(agent_id)
        .await
        .map_err(|e| format!("State update failed: {}", e))?;

    print_json(&serde_json::json!({
        "success": true,
        "agentId": agent_id,
        "message": format!("Agent '{}' uninstalled", agent_id),
    }));
    Ok(())
}

// ─── List (registry) ──────────────────────────────────────────────────────

/// Show all agents from the ACP registry with their install status.
pub async fn list(state: &AppState) -> Result<(), String> {
    let _ = state.acp_installation_state.load().await;

    println!("[acp list] Fetching registry…");
    let registry = fetch_registry_json().await?;

    let agents = registry
        .get("agents")
        .and_then(|a| a.as_array())
        .cloned()
        .unwrap_or_default();

    let npx_ok = routa_core::shell_env::which("npx").is_some();
    let uvx_ok = routa_core::shell_env::which("uv").is_some();

    let mut rows: Vec<serde_json::Value> = Vec::new();
    for agent in &agents {
        let id = agent.get("id").and_then(|v| v.as_str()).unwrap_or("");
        let dist = agent
            .get("distribution")
            .cloned()
            .unwrap_or_default();
        let installed = state.acp_installation_state.is_installed(id).await
            || quick_check_installed(&dist, npx_ok, uvx_ok);

        rows.push(serde_json::json!({
            "id": id,
            "name": agent.get("name").and_then(|v| v.as_str()).unwrap_or(id),
            "version": agent.get("version").and_then(|v| v.as_str()).unwrap_or(""),
            "description": agent.get("description").and_then(|v| v.as_str()).unwrap_or(""),
            "distribution": dist_summary(&dist),
            "installed": installed,
        }));
    }

    print_json(&serde_json::json!({ "agents": rows, "total": rows.len() }));
    Ok(())
}

// ─── Installed ────────────────────────────────────────────────────────────

/// Show agents that are already installed locally.
pub async fn list_installed(state: &AppState) -> Result<(), String> {
    let _ = state.acp_installation_state.load().await;
    let installed = state.acp_installation_state.get_all_installed().await;
    print_json(&serde_json::json!({ "installed": installed, "total": installed.len() }));
    Ok(())
}

// ─── Runtime status ───────────────────────────────────────────────────────

/// Show Node.js and uv runtime health.
pub async fn runtime_status(state: &AppState) -> Result<(), String> {
    let rm = &state.acp_runtime_manager;
    let platform = current_platform();

    let check = |rt: RuntimeType| {
        let rm = rm;
        async move {
            let managed = rm.get_managed_runtime(&rt).await;
            let system = rm.get_system_runtime(&rt);
            serde_json::json!({
                "available": managed.is_some() || system.is_some(),
                "managed": managed.as_ref().map(|i| i.path.to_string_lossy().to_string()),
                "system":  system.as_ref().map(|i| i.path.to_string_lossy().to_string()),
            })
        }
    };

    let (node, npx, uv, uvx) = tokio::join!(
        check(RuntimeType::Node),
        check(RuntimeType::Npx),
        check(RuntimeType::Uv),
        check(RuntimeType::Uvx),
    );

    print_json(&serde_json::json!({
        "platform": platform,
        "runtimes": {
            "node": node,
            "npx":  npx,
            "uv":   uv,
            "uvx":  uvx,
        }
    }));
    Ok(())
}

/// Download Node.js (managed) if not already present.
pub async fn ensure_node(state: &AppState) -> Result<(), String> {
    println!("[acp runtime] Ensuring Node.js…");
    let info = state
        .acp_runtime_manager
        .ensure_runtime(&RuntimeType::Node)
        .await?;
    print_json(&serde_json::json!({
        "success": true,
        "runtime": "node",
        "path": info.path.to_string_lossy(),
        "version": info.version,
        "managed": info.is_managed,
    }));
    Ok(())
}

/// Download uv (managed) if not already present.
pub async fn ensure_uv(state: &AppState) -> Result<(), String> {
    println!("[acp runtime] Ensuring uv…");
    let info = state
        .acp_runtime_manager
        .ensure_runtime(&RuntimeType::Uv)
        .await?;
    print_json(&serde_json::json!({
        "success": true,
        "runtime": "uv",
        "path": info.path.to_string_lossy(),
        "version": info.version,
        "managed": info.is_managed,
    }));
    Ok(())
}

// ─── Private helpers ──────────────────────────────────────────────────────

fn find_agent<'a>(
    registry: &'a serde_json::Value,
    agent_id: &str,
) -> Result<&'a serde_json::Value, String> {
    registry
        .get("agents")
        .and_then(|a| a.as_array())
        .and_then(|arr| {
            arr.iter()
                .find(|a| a.get("id").and_then(|v| v.as_str()) == Some(agent_id))
        })
        .ok_or_else(|| format!("Agent '{}' not found in registry", agent_id))
}

/// Pick the best distribution type given availability.
fn choose_dist_type(dist: &serde_json::Value) -> String {
    let npx_ok = routa_core::shell_env::which("npx").is_some();
    let uvx_ok = routa_core::shell_env::which("uv").is_some();

    if dist.get("npx").is_some() && npx_ok {
        return "npx".into();
    }
    if dist.get("uvx").is_some() && uvx_ok {
        return "uvx".into();
    }
    // Fall back without requiring system runtime (will download managed one)
    if dist.get("npx").is_some() {
        return "npx".into();
    }
    if dist.get("uvx").is_some() {
        return "uvx".into();
    }
    if dist.get("binary").is_some() {
        return "binary".into();
    }
    "npx".into()
}

async fn install_npx(
    state: &AppState,
    agent_id: &str,
    name: &str,
    version: &str,
    dist: &serde_json::Value,
) -> Result<(), String> {
    // Ensure Node.js / npx is available (download if needed)
    println!("[acp install] Ensuring npx runtime…");
    let _npx_info = state
        .acp_runtime_manager
        .ensure_runtime(&RuntimeType::Npx)
        .await
        .map_err(|e| format!("Failed to ensure npx runtime: {}", e))?;
    println!("[acp install] npx ready: {:?}", _npx_info.path);

    let package = dist
        .get("npx")
        .and_then(|v| v.get("package"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    state
        .acp_installation_state
        .mark_installed(agent_id, version, DistributionType::Npx, None, package)
        .await
        .map_err(|e| format!("Failed to save state: {}", e))?;

    println!("[acp install] '{}' installed (npx will fetch on first run)", name);
    Ok(())
}

async fn install_uvx(
    state: &AppState,
    agent_id: &str,
    name: &str,
    version: &str,
    dist: &serde_json::Value,
) -> Result<(), String> {
    println!("[acp install] Ensuring uv/uvx runtime…");
    let _uv_info = state
        .acp_runtime_manager
        .ensure_runtime(&RuntimeType::Uvx)
        .await
        .map_err(|e| format!("Failed to ensure uvx runtime: {}", e))?;
    println!("[acp install] uvx ready: {:?}", _uv_info.path);

    let package = dist
        .get("uvx")
        .and_then(|v| v.get("package"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string());

    state
        .acp_installation_state
        .mark_installed(agent_id, version, DistributionType::Uvx, None, package)
        .await
        .map_err(|e| format!("Failed to save state: {}", e))?;

    println!("[acp install] '{}' installed (uvx will fetch on first run)", name);
    Ok(())
}

async fn install_binary(
    state: &AppState,
    agent_id: &str,
    name: &str,
    version: &str,
    dist: &serde_json::Value,
) -> Result<(), String> {
    let platform = AcpPaths::current_platform();
    let binary_config = dist
        .get("binary")
        .and_then(|b| b.get(&platform))
        .ok_or_else(|| format!("No binary for platform '{}'", platform))?;

    let binary_info: routa_core::acp::BinaryInfo =
        serde_json::from_value(binary_config.clone())
            .map_err(|e| format!("Invalid binary config: {}", e))?;

    println!("[acp install] Downloading binary for '{}'…", name);
    let exe = state
        .acp_binary_manager
        .install_binary(agent_id, version, &binary_info)
        .await
        .map_err(|e| format!("Binary install failed: {}", e))?;

    let exe_str = exe.to_string_lossy().to_string();
    state
        .acp_installation_state
        .mark_installed(
            agent_id,
            version,
            DistributionType::Binary,
            Some(exe_str.clone()),
            None,
        )
        .await
        .map_err(|e| format!("State update failed: {}", e))?;

    println!("[acp install] '{}' binary installed → {}", name, exe_str);
    Ok(())
}

fn quick_check_installed(dist: &serde_json::Value, npx_ok: bool, uvx_ok: bool) -> bool {
    (dist.get("npx").is_some() && npx_ok) || (dist.get("uvx").is_some() && uvx_ok)
}

fn dist_summary(dist: &serde_json::Value) -> Vec<String> {
    let mut types = Vec::new();
    if dist.get("npx").is_some() {
        types.push("npx".to_string());
    }
    if dist.get("uvx").is_some() {
        types.push("uvx".to_string());
    }
    if dist.get("binary").is_some() {
        types.push("binary".to_string());
    }
    types
}
