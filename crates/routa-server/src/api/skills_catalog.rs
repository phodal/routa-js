//! Skill catalog API — browse and install from remote GitHub catalogs.
//!
//! GET  /api/skills/catalog?repo=openai/skills&path=skills/.curated&ref=main
//! POST /api/skills/catalog  { repo, path, ref, skills: [name, ...] }

use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::path::PathBuf;

use crate::error::ServerError;
use crate::state::AppState;

const DEFAULT_REPO: &str = "openai/skills";
const DEFAULT_PATH: &str = "skills/.curated";
const DEFAULT_REF: &str = "main";

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_catalog).post(install_from_catalog))
}

// ── List catalog ────────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
struct CatalogQuery {
    repo: Option<String>,
    path: Option<String>,
    #[serde(rename = "ref")]
    git_ref: Option<String>,
}

#[derive(Debug, Serialize)]
struct CatalogSkill {
    name: String,
    installed: bool,
}

async fn list_catalog(
    Query(query): Query<CatalogQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let repo = query.repo.as_deref().unwrap_or(DEFAULT_REPO);
    let catalog_path = query.path.as_deref().unwrap_or(DEFAULT_PATH);
    let git_ref = query.git_ref.as_deref().unwrap_or(DEFAULT_REF);

    let api_url = format!(
        "https://api.github.com/repos/{}/contents/{}?ref={}",
        repo, catalog_path, git_ref
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&api_url)
        .header("User-Agent", "routa-skill-catalog")
        .header("Accept", "application/vnd.github.v3+json");

    if let Some(token) = github_token() {
        req = req.header("Authorization", format!("token {}", token));
    }

    let response = req.send().await.map_err(|e| {
        ServerError::Internal(format!("GitHub API request failed: {}", e))
    })?;

    if response.status() == 404 {
        return Err(ServerError::NotFound(format!(
            "Catalog not found: https://github.com/{}/tree/{}/{}",
            repo, git_ref, catalog_path
        )));
    }

    if !response.status().is_success() {
        return Err(ServerError::Internal(format!(
            "GitHub API error: HTTP {}",
            response.status()
        )));
    }

    let entries: Vec<serde_json::Value> = response.json().await.map_err(|e| {
        ServerError::Internal(format!("Failed to parse GitHub response: {}", e))
    })?;

    let installed = installed_skill_names();

    let skills: Vec<CatalogSkill> = entries
        .iter()
        .filter(|e| e.get("type").and_then(|t| t.as_str()) == Some("dir"))
        .filter_map(|e| e.get("name").and_then(|n| n.as_str()).map(String::from))
        .map(|name| {
            let is_installed = installed.contains(&name);
            CatalogSkill {
                name,
                installed: is_installed,
            }
        })
        .collect();

    Ok(Json(serde_json::json!({
        "skills": skills,
        "repo": repo,
        "path": catalog_path,
        "ref": git_ref,
    })))
}

// ── Install from catalog ────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct InstallRequest {
    #[serde(default = "default_repo")]
    repo: String,
    #[serde(default = "default_path")]
    path: String,
    #[serde(default = "default_ref", rename = "ref")]
    git_ref: String,
    skills: Vec<String>,
}

fn default_repo() -> String {
    DEFAULT_REPO.into()
}
fn default_path() -> String {
    DEFAULT_PATH.into()
}
fn default_ref() -> String {
    DEFAULT_REF.into()
}

async fn install_from_catalog(
    State(_state): State<AppState>,
    Json(body): Json<InstallRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    if body.skills.is_empty() {
        return Err(ServerError::BadRequest(
            "Missing 'skills' array".to_string(),
        ));
    }

    let parts: Vec<&str> = body.repo.split('/').collect();
    if parts.len() != 2 {
        return Err(ServerError::BadRequest(
            "Invalid repo format, expected owner/repo".to_string(),
        ));
    }
    let (owner, repo_name) = (parts[0], parts[1]);

    // Download zip from GitHub
    let zip_url = format!(
        "https://codeload.github.com/{}/{}/zip/{}",
        owner, repo_name, body.git_ref
    );

    let client = reqwest::Client::new();
    let mut req = client
        .get(&zip_url)
        .header("User-Agent", "routa-skill-install");

    if let Some(token) = github_token() {
        req = req.header("Authorization", format!("token {}", token));
    }

    let response = req.send().await.map_err(|e| {
        ServerError::Internal(format!("Failed to download repo zip: {}", e))
    })?;

    if !response.status().is_success() {
        return Err(ServerError::Internal(format!(
            "Failed to download repo: HTTP {}",
            response.status()
        )));
    }

    let zip_bytes = response.bytes().await.map_err(|e| {
        ServerError::Internal(format!("Failed to read zip: {}", e))
    })?;

    // Extract to temp directory
    let tmp_dir = tempfile::tempdir().map_err(|e| {
        ServerError::Internal(format!("Failed to create temp dir: {}", e))
    })?;

    let cursor = std::io::Cursor::new(&zip_bytes);
    let mut archive = zip::ZipArchive::new(cursor).map_err(|e| {
        ServerError::Internal(format!("Failed to open zip: {}", e))
    })?;

    archive.extract(tmp_dir.path()).map_err(|e| {
        ServerError::Internal(format!("Failed to extract zip: {}", e))
    })?;

    // Find top-level directory
    let top_dirs: Vec<_> = std::fs::read_dir(tmp_dir.path())
        .map_err(|e| ServerError::Internal(format!("Failed to read temp dir: {}", e)))?
        .flatten()
        .filter(|e| e.path().is_dir())
        .collect();

    if top_dirs.len() != 1 {
        return Err(ServerError::Internal(
            "Unexpected archive layout".to_string(),
        ));
    }

    let repo_root = top_dirs[0].path();

    // Install destination
    let dest_base = dirs::home_dir()
        .map(|h| h.join(".codex/skills"))
        .unwrap_or_else(|| PathBuf::from(".codex/skills"));
    std::fs::create_dir_all(&dest_base).ok();

    let mut installed = Vec::new();
    let mut errors = Vec::new();

    for skill_name in &body.skills {
        let skill_src = repo_root.join(&body.path).join(skill_name);

        if !skill_src.is_dir() {
            errors.push(format!("Skill not found in catalog: {}", skill_name));
            continue;
        }

        let skill_md = skill_src.join("SKILL.md");
        if !skill_md.is_file() {
            errors.push(format!("No SKILL.md in {}", skill_name));
            continue;
        }

        let dest_dir = dest_base.join(skill_name);
        if dest_dir.exists() {
            errors.push(format!("Already installed: {}", skill_name));
            continue;
        }

        match routa_core::git::copy_dir_recursive(&skill_src, &dest_dir) {
            Ok(_) => installed.push(skill_name.clone()),
            Err(e) => errors.push(format!("Failed to install {}: {}", skill_name, e)),
        }
    }

    Ok(Json(serde_json::json!({
        "success": !installed.is_empty(),
        "installed": installed,
        "errors": errors,
        "dest": dest_base.to_string_lossy(),
    })))
}

// ── Helpers ─────────────────────────────────────────────────────────────

fn github_token() -> Option<String> {
    std::env::var("GITHUB_TOKEN")
        .ok()
        .or_else(|| std::env::var("GH_TOKEN").ok())
}

fn installed_skill_names() -> HashSet<String> {
    let mut names = HashSet::new();

    let dirs_to_check: Vec<PathBuf> = vec![
        dirs::home_dir()
            .map(|h| h.join(".codex/skills"))
            .unwrap_or_default(),
        dirs::home_dir()
            .map(|h| h.join(".agents/skills"))
            .unwrap_or_default(),
    ];

    for dir in dirs_to_check {
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                if entry.path().is_dir() {
                    if let Some(name) = entry.file_name().to_str() {
                        names.insert(name.to_string());
                    }
                }
            }
        }
    }

    names
}
