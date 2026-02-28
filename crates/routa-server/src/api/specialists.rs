use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;

use crate::error::ServerError;
use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(list_specialists).post(create_specialist).put(update_specialist).delete(delete_specialist))
}

#[derive(Debug, Deserialize)]
struct SpecialistQuery {
    id: Option<String>,
}

/// GET /api/specialists — List all specialists or get a specific one.
/// 
/// For desktop/SQLite version, we return bundled specialists only.
/// Full CRUD operations require Postgres (Vercel deployment).
async fn list_specialists(
    State(_state): State<AppState>,
    Query(query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    // Return bundled specialists (hardcoded for now)
    let specialists = get_bundled_specialists();
    
    if let Some(id) = query.id {
        let specialist = specialists.iter().find(|s| s["id"] == id);
        if let Some(s) = specialist {
            return Ok(Json(s.clone()));
        }
        return Err(ServerError::NotFound("Specialist not found".to_string()));
    }
    
    Ok(Json(serde_json::json!({ "specialists": specialists })))
}

/// POST /api/specialists — Create a new specialist.
/// 
/// Not supported in desktop/SQLite version.
async fn create_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist creation requires Postgres database (Vercel deployment)".to_string()
    ))
}

/// PUT /api/specialists — Update a specialist.
/// 
/// Not supported in desktop/SQLite version.
async fn update_specialist(
    State(_state): State<AppState>,
    Json(_body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist updates require Postgres database (Vercel deployment)".to_string()
    ))
}

/// DELETE /api/specialists — Delete a specialist.
/// 
/// Not supported in desktop/SQLite version.
async fn delete_specialist(
    State(_state): State<AppState>,
    Query(_query): Query<SpecialistQuery>,
) -> Result<Json<serde_json::Value>, ServerError> {
    Err(ServerError::NotImplemented(
        "Specialist deletion requires Postgres database (Vercel deployment)".to_string()
    ))
}

/// Get bundled specialists (hardcoded for desktop version).
fn get_bundled_specialists() -> Vec<serde_json::Value> {
    vec![
        serde_json::json!({
            "id": "architect",
            "name": "Architect",
            "description": "System design and architecture specialist",
            "role": "CRAFTER",
            "defaultModelTier": "ADVANCED",
            "systemPrompt": "You are an expert software architect. Focus on system design, scalability, and best practices.",
            "source": "bundled",
            "enabled": true
        }),
        serde_json::json!({
            "id": "debugger",
            "name": "Debugger",
            "description": "Bug investigation and fixing specialist",
            "role": "DEVELOPER",
            "defaultModelTier": "STANDARD",
            "systemPrompt": "You are an expert debugger. Focus on identifying root causes and providing clear fixes.",
            "source": "bundled",
            "enabled": true
        }),
        serde_json::json!({
            "id": "reviewer",
            "name": "Code Reviewer",
            "description": "Code review and quality assurance specialist",
            "role": "GATE",
            "defaultModelTier": "STANDARD",
            "systemPrompt": "You are an expert code reviewer. Focus on code quality, best practices, and potential issues.",
            "source": "bundled",
            "enabled": true
        }),
        serde_json::json!({
            "id": "tester",
            "name": "Test Engineer",
            "description": "Testing and quality assurance specialist",
            "role": "DEVELOPER",
            "defaultModelTier": "STANDARD",
            "systemPrompt": "You are an expert test engineer. Focus on writing comprehensive tests and ensuring quality.",
            "source": "bundled",
            "enabled": true
        }),
        serde_json::json!({
            "id": "documenter",
            "name": "Documentation Writer",
            "description": "Technical documentation specialist",
            "role": "DEVELOPER",
            "defaultModelTier": "STANDARD",
            "systemPrompt": "You are an expert technical writer. Focus on clear, comprehensive documentation.",
            "source": "bundled",
            "enabled": true
        }),
    ]
}

