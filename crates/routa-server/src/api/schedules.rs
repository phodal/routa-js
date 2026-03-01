use axum::{
    extract::{Path, Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::models::schedule::{CreateScheduleInput, UpdateScheduleInput};
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/", get(list_schedules).post(create_schedule))
        .route("/{id}", get(get_schedule).patch(update_schedule).delete(delete_schedule))
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ListQuery {
    workspace_id: Option<String>,
}

async fn list_schedules(
    State(state): State<AppState>,
    Query(q): Query<ListQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let workspace_id = q.workspace_id.as_deref().unwrap_or("default");
    let schedules = state.schedule_store.list_by_workspace(workspace_id).await?;
    Ok(Json(serde_json::json!({ "schedules": schedules })))
}

async fn create_schedule(
    State(state): State<AppState>,
    Json(body): Json<CreateScheduleInput>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let schedule = state.schedule_store.create(body).await?;
    Ok(Json(serde_json::json!({ "schedule": schedule })))
}

async fn get_schedule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    match state.schedule_store.get(&id).await? {
        Some(s) => Ok(Json(serde_json::json!({ "schedule": s }))),
        None => Err(ServerError::NotFound(format!("Schedule {} not found", id))),
    }
}

async fn update_schedule(
    State(state): State<AppState>,
    Path(id): Path<String>,
    Json(body): Json<UpdateScheduleInput>,
) -> Result<Json<serde_json::Value>, ServerError> {
    match state.schedule_store.update(&id, body).await? {
        Some(s) => Ok(Json(serde_json::json!({ "schedule": s }))),
        None => Err(ServerError::NotFound(format!("Schedule {} not found", id))),
    }
}

async fn delete_schedule(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<serde_json::Value>, ServerError> {
    let deleted = state.schedule_store.delete(&id).await?;
    Ok(Json(serde_json::json!({ "deleted": deleted })))
}
