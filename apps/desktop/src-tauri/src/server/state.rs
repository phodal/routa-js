//! Shared application state for the axum server.

use std::sync::Arc;

use crate::server::acp::AcpManager;
use crate::server::db::Database;
use crate::server::events::EventBus;
use crate::server::skills::SkillRegistry;
use crate::server::store::{
    AgentStore, ConversationStore, NoteStore, TaskStore, WorkspaceStore,
};

/// Shared state accessible by all API handlers.
pub struct AppStateInner {
    pub db: Database,
    pub workspace_store: WorkspaceStore,
    pub agent_store: AgentStore,
    pub task_store: TaskStore,
    pub note_store: NoteStore,
    pub conversation_store: ConversationStore,
    pub skill_registry: SkillRegistry,
    pub acp_manager: AcpManager,
    pub event_bus: EventBus,
}

pub type AppState = Arc<AppStateInner>;

impl AppStateInner {
    pub fn new(db: Database) -> Self {
        Self {
            workspace_store: WorkspaceStore::new(db.clone()),
            agent_store: AgentStore::new(db.clone()),
            task_store: TaskStore::new(db.clone()),
            note_store: NoteStore::new(db.clone()),
            conversation_store: ConversationStore::new(db.clone()),
            skill_registry: SkillRegistry::new(),
            acp_manager: AcpManager::new(),
            event_bus: EventBus::new(),
            db,
        }
    }
}
