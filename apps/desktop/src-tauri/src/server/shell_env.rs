//! Resolve the user's full shell PATH for macOS GUI apps.
//!
//! macOS applications launched from Finder/Dock inherit a minimal PATH
//! (`/usr/bin:/bin:/usr/sbin:/sbin`). This module recovers the user's
//! login-shell PATH so we can find CLI tools like `opencode`, `claude`, etc.

use std::sync::OnceLock;

static FULL_PATH: OnceLock<String> = OnceLock::new();

/// Get the user's full shell PATH.
/// Cached after the first call.
pub fn full_path() -> &'static str {
    FULL_PATH.get_or_init(|| resolve_shell_path())
}

/// Resolve PATH by running the user's login shell.
fn resolve_shell_path() -> String {
    let current = std::env::var("PATH").unwrap_or_default();

    // Common directories for user-installed CLI tools on macOS
    let extra_dirs = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ];

    // Home-relative directories
    let home = dirs::home_dir().unwrap_or_default();
    let home_dirs = [
        home.join(".local/bin"),
        home.join(".cargo/bin"),
        home.join(".opencode/bin"),
        home.join(".bun/bin"),
        home.join("bin"),
        home.join("go/bin"),
        home.join(".npm-global/bin"),
    ];

    // Try to get the real PATH from the user's login shell
    let shell_path = std::process::Command::new("/bin/zsh")
        .args(["-l", "-c", "echo $PATH"])
        .output()
        .ok()
        .and_then(|o| {
            if o.status.success() {
                String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
            } else {
                None
            }
        })
        .or_else(|| {
            std::process::Command::new("/bin/bash")
                .args(["-l", "-c", "echo $PATH"])
                .output()
                .ok()
                .and_then(|o| {
                    if o.status.success() {
                        String::from_utf8(o.stdout).ok().map(|s| s.trim().to_string())
                    } else {
                        None
                    }
                })
        });

    // Merge all paths: shell PATH + extra dirs + current PATH
    let mut seen = std::collections::HashSet::new();
    let mut parts = Vec::new();

    // Shell path first (most complete)
    if let Some(ref sp) = shell_path {
        for p in sp.split(':') {
            if !p.is_empty() && seen.insert(p.to_string()) {
                parts.push(p.to_string());
            }
        }
    }

    // Then current PATH
    for p in current.split(':') {
        if !p.is_empty() && seen.insert(p.to_string()) {
            parts.push(p.to_string());
        }
    }

    // Then well-known dirs
    for dir in &extra_dirs {
        let d = dir.to_string();
        if std::path::Path::new(dir).is_dir() && seen.insert(d.clone()) {
            parts.push(d);
        }
    }
    for dir in &home_dirs {
        let d = dir.to_string_lossy().to_string();
        if dir.is_dir() && seen.insert(d.clone()) {
            parts.push(d);
        }
    }

    let result = parts.join(":");
    tracing::info!("[shell_env] Resolved PATH ({} entries)", parts.len());
    result
}

/// Run a `which`-like check for a command using the full PATH.
pub fn which(cmd: &str) -> Option<String> {
    let path = full_path();
    for dir in path.split(':') {
        let candidate = std::path::Path::new(dir).join(cmd);
        if candidate.is_file() {
            return Some(candidate.to_string_lossy().to_string());
        }
    }
    None
}
