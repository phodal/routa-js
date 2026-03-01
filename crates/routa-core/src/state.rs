//! Shared application state for the axum server.

use std::sync::Arc;

use crate::acp::{AcpBinaryManager, AcpInstallationState, AcpManager, AcpPaths, AcpRuntimeManager, AcpWarmupService};
use crate::db::Database;
use crate::events::EventBus;
use crate::skills::SkillRegistry;
use crate::store::{
    AcpSessionStore, AgentStore, CodebaseStore, ConversationStore, NoteStore, ScheduleStore, TaskStore,
    WorkspaceStore,
};

/// Shared state accessible by all API handlers.
pub struct AppStateInner {
    pub db: Database,
    pub workspace_store: WorkspaceStore,
    pub codebase_store: CodebaseStore,
    pub agent_store: AgentStore,
    pub task_store: TaskStore,
    pub note_store: NoteStore,
    pub schedule_store: ScheduleStore,
    pub conversation_store: ConversationStore,
    pub acp_session_store: AcpSessionStore,
    pub skill_registry: SkillRegistry,
    pub acp_manager: AcpManager,
    pub event_bus: EventBus,
    pub acp_paths: AcpPaths,
    pub acp_binary_manager: AcpBinaryManager,
    pub acp_installation_state: AcpInstallationState,
    pub acp_runtime_manager: AcpRuntimeManager,
    pub acp_warmup_service: AcpWarmupService,
}

pub type AppState = Arc<AppStateInner>;

impl AppStateInner {
    pub fn new(db: Database) -> Self {
        let acp_paths = AcpPaths::new();
        let acp_binary_manager = AcpBinaryManager::new(acp_paths.clone());
        let acp_installation_state = AcpInstallationState::new(acp_paths.clone());
        let acp_runtime_manager = AcpRuntimeManager::new(acp_paths.clone());
        let acp_warmup_service = AcpWarmupService::new(acp_paths.clone());
        Self {
            workspace_store: WorkspaceStore::new(db.clone()),
            codebase_store: CodebaseStore::new(db.clone()),
            agent_store: AgentStore::new(db.clone()),
            task_store: TaskStore::new(db.clone()),
            note_store: NoteStore::new(db.clone()),
            schedule_store: ScheduleStore::new(db.clone()),
            conversation_store: ConversationStore::new(db.clone()),
            acp_session_store: AcpSessionStore::new(db.clone()),
            skill_registry: SkillRegistry::new(),
            acp_manager: AcpManager::new(),
            event_bus: EventBus::new(),
            db,
            acp_paths,
            acp_binary_manager,
            acp_installation_state,
            acp_runtime_manager,
            acp_warmup_service,
        }
    }
}
