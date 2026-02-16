pub mod acp_routes;
pub mod agents;
pub mod notes;
pub mod sessions;
pub mod skills;
pub mod tasks;
pub mod workspaces;

use axum::Router;

use crate::server::state::AppState;

/// Build the complete API router with all sub-routes.
pub fn api_router() -> Router<AppState> {
    Router::new()
        .nest("/api/agents", agents::router())
        .nest("/api/notes", notes::router())
        .nest("/api/tasks", tasks::router())
        .nest("/api/workspaces", workspaces::router())
        .nest("/api/skills", skills::router())
        .nest("/api/sessions", sessions::router())
        .nest("/api/acp", acp_routes::router())
}
