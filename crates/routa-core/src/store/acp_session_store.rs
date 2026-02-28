//! Store for ACP session persistence.
//!
//! Handles loading and saving session history to the SQLite database.

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};

use crate::db::Database;
use crate::error::ServerError;

/// A session update notification stored in the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionUpdateNotification {
    pub session_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub update: Option<serde_json::Value>,
    #[serde(flatten)]
    pub extra: serde_json::Map<String, serde_json::Value>,
}

/// ACP session record from the database.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcpSessionRow {
    pub id: String,
    pub name: Option<String>,
    pub cwd: String,
    pub workspace_id: String,
    pub routa_agent_id: Option<String>,
    pub provider: Option<String>,
    pub role: Option<String>,
    pub mode_id: Option<String>,
    pub first_prompt_sent: bool,
    pub message_history: Vec<serde_json::Value>,
    pub created_at: i64,
    pub updated_at: i64,
}

pub struct AcpSessionStore {
    db: Database,
}

impl AcpSessionStore {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    /// Load a session by ID.
    pub async fn get(&self, session_id: &str) -> Result<Option<AcpSessionRow>, ServerError> {
        let id = session_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, name, cwd, workspace_id, routa_agent_id, provider, role, mode_id,
                            first_prompt_sent, message_history, created_at, updated_at
                     FROM acp_sessions WHERE id = ?1",
                )?;

                let row = stmt
                    .query_row([&id], |row| {
                        let history_json: String = row.get(9)?;
                        let history: Vec<serde_json::Value> =
                            serde_json::from_str(&history_json).unwrap_or_default();

                        Ok(AcpSessionRow {
                            id: row.get(0)?,
                            name: row.get(1)?,
                            cwd: row.get(2)?,
                            workspace_id: row.get(3)?,
                            routa_agent_id: row.get(4)?,
                            provider: row.get(5)?,
                            role: row.get(6)?,
                            mode_id: row.get(7)?,
                            first_prompt_sent: row.get::<_, i32>(8)? != 0,
                            message_history: history,
                            created_at: row.get(10)?,
                            updated_at: row.get(11)?,
                        })
                    })
                    .optional()?;

                Ok(row)
            })
            .await
    }

    /// Load session history from the database.
    pub async fn get_history(
        &self,
        session_id: &str,
    ) -> Result<Vec<serde_json::Value>, ServerError> {
        let id = session_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt =
                    conn.prepare("SELECT message_history FROM acp_sessions WHERE id = ?1")?;

                let history_json: Option<String> =
                    stmt.query_row([&id], |row| row.get(0)).optional()?;

                match history_json {
                    Some(json) => {
                        let history: Vec<serde_json::Value> =
                            serde_json::from_str(&json).unwrap_or_default();
                        Ok(history)
                    }
                    None => Ok(vec![]),
                }
            })
            .await
    }

    /// List sessions, optionally filtered by workspace.
    pub async fn list(
        &self,
        workspace_id: Option<&str>,
        limit: Option<usize>,
    ) -> Result<Vec<AcpSessionRow>, ServerError> {
        let workspace_filter = workspace_id.map(|s| s.to_string());
        let limit = limit.unwrap_or(100);
        self.db
            .with_conn_async(move |conn| {
                let (sql, params): (&str, Vec<Box<dyn rusqlite::ToSql>>) = match &workspace_filter {
                    Some(ws) => (
                        "SELECT id, name, cwd, workspace_id, routa_agent_id, provider, role, mode_id,
                                first_prompt_sent, message_history, created_at, updated_at
                         FROM acp_sessions WHERE workspace_id = ?1 ORDER BY updated_at DESC LIMIT ?2",
                        vec![Box::new(ws.clone()) as Box<dyn rusqlite::ToSql>, Box::new(limit as i64)],
                    ),
                    None => (
                        "SELECT id, name, cwd, workspace_id, routa_agent_id, provider, role, mode_id,
                                first_prompt_sent, message_history, created_at, updated_at
                         FROM acp_sessions ORDER BY updated_at DESC LIMIT ?1",
                        vec![Box::new(limit as i64) as Box<dyn rusqlite::ToSql>],
                    ),
                };

                let mut stmt = conn.prepare(sql)?;
                let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
                let rows = stmt.query_map(param_refs.as_slice(), |row| {
                    let history_json: String = row.get(9)?;
                    let history: Vec<serde_json::Value> =
                        serde_json::from_str(&history_json).unwrap_or_default();

                    Ok(AcpSessionRow {
                        id: row.get(0)?,
                        name: row.get(1)?,
                        cwd: row.get(2)?,
                        workspace_id: row.get(3)?,
                        routa_agent_id: row.get(4)?,
                        provider: row.get(5)?,
                        role: row.get(6)?,
                        mode_id: row.get(7)?,
                        first_prompt_sent: row.get::<_, i32>(8)? != 0,
                        message_history: history,
                        created_at: row.get(10)?,
                        updated_at: row.get(11)?,
                    })
                })?;

                let mut sessions = Vec::new();
                for row in rows {
                    sessions.push(row?);
                }
                Ok(sessions)
            })
            .await
    }

    /// Append a notification to session history.
    pub async fn append_history(
        &self,
        session_id: &str,
        notification: serde_json::Value,
    ) -> Result<(), ServerError> {
        let id = session_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                // Get current history
                let mut stmt =
                    conn.prepare("SELECT message_history FROM acp_sessions WHERE id = ?1")?;
                let history_json: Option<String> =
                    stmt.query_row([&id], |row| row.get(0)).optional()?;

                let mut history: Vec<serde_json::Value> = match history_json {
                    Some(json) => serde_json::from_str(&json).unwrap_or_default(),
                    None => return Ok(()), // Session doesn't exist
                };

                // Append notification
                history.push(notification);

                // Update database
                let new_history_json = serde_json::to_string(&history).unwrap_or_default();
                let now = chrono::Utc::now().timestamp_millis();
                conn.execute(
                    "UPDATE acp_sessions SET message_history = ?1, updated_at = ?2 WHERE id = ?3",
                    rusqlite::params![new_history_json, now, id],
                )?;

                Ok(())
            })
            .await
    }
}

