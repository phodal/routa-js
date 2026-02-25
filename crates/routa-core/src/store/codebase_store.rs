use chrono::Utc;
use rusqlite::OptionalExtension;

use crate::db::Database;
use crate::error::ServerError;
use crate::models::codebase::Codebase;

pub struct CodebaseStore {
    db: Database,
}

impl CodebaseStore {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn save(&self, codebase: &Codebase) -> Result<(), ServerError> {
        let cb = codebase.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "INSERT INTO codebases (id, workspace_id, repo_path, branch, label, is_default, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
                    rusqlite::params![
                        cb.id,
                        cb.workspace_id,
                        cb.repo_path,
                        cb.branch,
                        cb.label,
                        cb.is_default as i32,
                        cb.created_at.timestamp_millis(),
                        cb.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn get(&self, id: &str) -> Result<Option<Codebase>, ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, workspace_id, repo_path, branch, label, is_default, created_at, updated_at
                     FROM codebases WHERE id = ?1",
                )?;
                stmt.query_row(rusqlite::params![id], |row| Ok(row_to_codebase(row)))
                    .optional()
            })
            .await
    }

    pub async fn list_by_workspace(&self, workspace_id: &str) -> Result<Vec<Codebase>, ServerError> {
        let workspace_id = workspace_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, workspace_id, repo_path, branch, label, is_default, created_at, updated_at
                     FROM codebases WHERE workspace_id = ?1 ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![workspace_id], |row| Ok(row_to_codebase(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn update(&self, id: &str, branch: Option<&str>, label: Option<&str>) -> Result<(), ServerError> {
        let id = id.to_string();
        let branch = branch.map(|s| s.to_string());
        let label = label.map(|s| s.to_string());
        let now = Utc::now().timestamp_millis();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "UPDATE codebases SET branch = ?1, label = ?2, updated_at = ?3 WHERE id = ?4",
                    rusqlite::params![branch, label, now, id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn delete(&self, id: &str) -> Result<(), ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                conn.execute("DELETE FROM codebases WHERE id = ?1", rusqlite::params![id])?;
                Ok(())
            })
            .await
    }

    pub async fn get_default(&self, workspace_id: &str) -> Result<Option<Codebase>, ServerError> {
        let workspace_id = workspace_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, workspace_id, repo_path, branch, label, is_default, created_at, updated_at
                     FROM codebases WHERE workspace_id = ?1 AND is_default = 1",
                )?;
                stmt.query_row(rusqlite::params![workspace_id], |row| Ok(row_to_codebase(row)))
                    .optional()
            })
            .await
    }

    pub async fn set_default(&self, workspace_id: &str, codebase_id: &str) -> Result<(), ServerError> {
        let workspace_id = workspace_id.to_string();
        let codebase_id = codebase_id.to_string();
        let now = Utc::now().timestamp_millis();
        self.db
            .with_conn_async(move |conn| {
                // Clear old default
                conn.execute(
                    "UPDATE codebases SET is_default = 0, updated_at = ?1 WHERE workspace_id = ?2 AND is_default = 1",
                    rusqlite::params![now, workspace_id],
                )?;
                // Set new default
                conn.execute(
                    "UPDATE codebases SET is_default = 1, updated_at = ?1 WHERE id = ?2 AND workspace_id = ?3",
                    rusqlite::params![now, codebase_id, workspace_id],
                )?;
                Ok(())
            })
            .await
    }

    pub async fn find_by_repo_path(&self, workspace_id: &str, repo_path: &str) -> Result<Option<Codebase>, ServerError> {
        let workspace_id = workspace_id.to_string();
        let repo_path = repo_path.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, workspace_id, repo_path, branch, label, is_default, created_at, updated_at
                     FROM codebases WHERE workspace_id = ?1 AND repo_path = ?2",
                )?;
                stmt.query_row(rusqlite::params![workspace_id, repo_path], |row| Ok(row_to_codebase(row)))
                    .optional()
            })
            .await
    }
}

use rusqlite::Row;

fn row_to_codebase(row: &Row<'_>) -> Codebase {
    let is_default_int: i32 = row.get(5).unwrap_or(0);
    let created_ms: i64 = row.get(6).unwrap_or(0);
    let updated_ms: i64 = row.get(7).unwrap_or(0);

    Codebase {
        id: row.get(0).unwrap_or_default(),
        workspace_id: row.get(1).unwrap_or_default(),
        repo_path: row.get(2).unwrap_or_default(),
        branch: row.get(3).unwrap_or(None),
        label: row.get(4).unwrap_or(None),
        is_default: is_default_int != 0,
        created_at: chrono::DateTime::from_timestamp_millis(created_ms)
            .unwrap_or_else(|| Utc::now()),
        updated_at: chrono::DateTime::from_timestamp_millis(updated_ms)
            .unwrap_or_else(|| Utc::now()),
    }
}
