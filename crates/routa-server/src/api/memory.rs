use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use serde::Deserialize;
use sysinfo::System;

use crate::state::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/", get(get_memory_stats).post(cleanup_memory).delete(reset_memory))
}

#[derive(Debug, Deserialize)]
struct MemoryQuery {
    history: Option<bool>,
}

/// GET /api/memory — Get memory usage statistics.
/// 
/// For desktop version, returns system memory info.
async fn get_memory_stats(
    State(_state): State<AppState>,
    Query(query): Query<MemoryQuery>,
) -> Json<serde_json::Value> {
    let mut sys = System::new_all();
    sys.refresh_memory();
    
    let total_memory = sys.total_memory();
    let used_memory = sys.used_memory();
    let available_memory = sys.available_memory();
    
    let usage_percentage = if total_memory > 0 {
        (used_memory as f64 / total_memory as f64 * 100.0) as u64
    } else {
        0
    };
    
    let level = if usage_percentage > 90 {
        "critical"
    } else if usage_percentage > 75 {
        "warning"
    } else {
        "normal"
    };
    
    let stats = serde_json::json!({
        "heapUsedMB": used_memory / 1024 / 1024,
        "heapTotalMB": total_memory / 1024 / 1024,
        "availableMB": available_memory / 1024 / 1024,
        "usagePercentage": usage_percentage,
        "level": level,
        "timestamp": chrono::Utc::now().to_rfc3339(),
    });
    
    if query.history.unwrap_or(false) {
        // Return with empty history for desktop version
        Json(serde_json::json!({
            "stats": stats,
            "history": [],
            "sessionStore": {
                "activeSessions": 0,
                "totalHistorySize": 0,
                "averageHistorySize": 0
            }
        }))
    } else {
        Json(stats)
    }
}

/// POST /api/memory — Trigger memory cleanup.
/// 
/// For desktop version, this is a no-op.
async fn cleanup_memory(
    State(_state): State<AppState>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "success": true,
        "message": "Memory cleanup not needed in desktop version",
        "cleaned": 0
    }))
}

/// DELETE /api/memory — Reset memory monitoring.
/// 
/// For desktop version, this is a no-op.
async fn reset_memory(
    State(_state): State<AppState>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "success": true,
        "message": "Memory monitoring reset not needed in desktop version"
    }))
}

