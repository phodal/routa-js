use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Codebase {
    pub id: String,
    pub workspace_id: String,
    pub repo_path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    pub is_default: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Codebase {
    pub fn new(
        id: String,
        workspace_id: String,
        repo_path: String,
        branch: Option<String>,
        label: Option<String>,
        is_default: bool,
    ) -> Self {
        let now = Utc::now();
        Self {
            id,
            workspace_id,
            repo_path,
            branch,
            label,
            is_default,
            created_at: now,
            updated_at: now,
        }
    }
}
