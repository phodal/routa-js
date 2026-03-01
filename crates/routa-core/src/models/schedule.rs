use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

/// A cron-based scheduled agent trigger.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Schedule {
    pub id: String,
    pub name: String,
    pub cron_expr: String,
    pub task_prompt: String,
    pub agent_id: String,
    pub workspace_id: String,
    pub enabled: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_run_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub next_run_at: Option<DateTime<Utc>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prompt_template: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// Input for creating a new schedule.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateScheduleInput {
    pub name: String,
    pub cron_expr: String,
    pub task_prompt: String,
    pub agent_id: String,
    pub workspace_id: String,
    #[serde(default = "default_true")]
    pub enabled: bool,
    pub next_run_at: Option<DateTime<Utc>>,
    pub prompt_template: Option<String>,
}

fn default_true() -> bool {
    true
}

/// Partial update input for PATCH.
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct UpdateScheduleInput {
    pub name: Option<String>,
    pub cron_expr: Option<String>,
    pub task_prompt: Option<String>,
    pub agent_id: Option<String>,
    pub enabled: Option<bool>,
    pub next_run_at: Option<DateTime<Utc>>,
    pub last_run_at: Option<DateTime<Utc>>,
    pub last_task_id: Option<String>,
    pub prompt_template: Option<String>,
}
