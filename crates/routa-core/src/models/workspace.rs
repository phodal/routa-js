use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum WorkspaceStatus {
    Active,
    Archived,
}

impl WorkspaceStatus {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Archived => "archived",
        }
    }

    pub fn from_str(s: &str) -> Self {
        match s {
            "archived" => Self::Archived,
            _ => Self::Active,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Workspace {
    pub id: String,
    pub title: String,
    pub status: WorkspaceStatus,
    #[serde(default)]
    pub metadata: HashMap<String, String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl Workspace {
    pub fn new(
        id: String,
        title: String,
        metadata: Option<HashMap<String, String>>,
    ) -> Self {
        let now = Utc::now();
        Self {
            id,
            title,
            status: WorkspaceStatus::Active,
            metadata: metadata.unwrap_or_default(),
            created_at: now,
            updated_at: now,
        }
    }
}
