use axum::{
    extract::State,
    routing::{get, patch, post},
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::models::codebase::Codebase;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/workspaces/{workspace_id}/codebases", get(list_codebases).post(add_codebase))
        .route("/codebases/{id}", patch(update_codebase).delete(delete_codebase))
        .route("/codebases/{id}/default", post(set_default_codebase))
}

async fn list_codebases(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let codebases = state.codebase_store.list_by_workspace(&workspace_id).await?;
    Ok(Json(serde_json::json!({ "codebases": codebases })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AddCodebaseRequest {
    repo_path: String,
    branch: Option<String>,
    label: Option<String>,
    #[serde(default)]
    is_default: bool,
}

async fn add_codebase(
    State(state): State<AppState>,
    axum::extract::Path(workspace_id): axum::extract::Path<String>,
    Json(body): Json<AddCodebaseRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Check for duplicate repo_path within the workspace
    if let Some(_existing) = state
        .codebase_store
        .find_by_repo_path(&workspace_id, &body.repo_path)
        .await?
    {
        return Err(ServerError::Conflict(format!(
            "Codebase with repo_path '{}' already exists in workspace {}",
            body.repo_path, workspace_id
        )));
    }

    let codebase = Codebase::new(
        uuid::Uuid::new_v4().to_string(),
        workspace_id,
        body.repo_path,
        body.branch,
        body.label,
        body.is_default,
    );

    state.codebase_store.save(&codebase).await?;
    Ok(Json(serde_json::json!({ "codebase": codebase })))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateCodebaseRequest {
    branch: Option<String>,
    label: Option<String>,
}

async fn update_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
    Json(body): Json<UpdateCodebaseRequest>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Verify codebase exists
    state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {} not found", id)))?;

    state
        .codebase_store
        .update(&id, body.branch.as_deref(), body.label.as_deref())
        .await?;

    let codebase = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {} not found", id)))?;

    Ok(Json(serde_json::json!({ "codebase": codebase })))
}

async fn delete_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    state.codebase_store.delete(&id).await?;
    Ok(Json(serde_json::json!({ "deleted": true })))
}

async fn set_default_codebase(
    State(state): State<AppState>,
    axum::extract::Path(id): axum::extract::Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let codebase = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {} not found", id)))?;

    state
        .codebase_store
        .set_default(&codebase.workspace_id, &id)
        .await?;

    let updated = state
        .codebase_store
        .get(&id)
        .await?
        .ok_or_else(|| ServerError::NotFound(format!("Codebase {} not found", id)))?;

    Ok(Json(serde_json::json!({ "codebase": updated })))
}
