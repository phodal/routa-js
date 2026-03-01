use chrono::Utc;
use rusqlite::OptionalExtension;

use crate::db::Database;
use crate::error::ServerError;
use crate::models::custom_mcp_server::{
    CreateCustomMcpServerInput, CustomMcpServer, McpServerType, UpdateCustomMcpServerInput,
};

#[derive(Clone)]
pub struct CustomMcpServerStore {
    db: Database,
}

impl CustomMcpServerStore {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, input: CreateCustomMcpServerInput) -> Result<CustomMcpServer, ServerError> {
        let now = Utc::now();
        let server = CustomMcpServer {
            id: input.id.clone(),
            name: input.name.clone(),
            description: input.description.clone(),
            server_type: input.server_type.clone(),
            command: input.command.clone(),
            args: input.args.clone(),
            url: input.url.clone(),
            headers: input.headers.clone(),
            env: input.env.clone(),
            enabled: input.enabled,
            workspace_id: input.workspace_id.clone(),
            created_at: now,
            updated_at: now,
        };
        let s = server.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "INSERT INTO custom_mcp_servers \
                     (id, name, description, type, command, args, url, headers, env, enabled, workspace_id, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    rusqlite::params![
                        s.id,
                        s.name,
                        s.description,
                        s.server_type.to_string(),
                        s.command,
                        s.args.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default()),
                        s.url,
                        s.headers.as_ref().map(|h| h.to_string()),
                        s.env.as_ref().map(|e| e.to_string()),
                        s.enabled as i64,
                        s.workspace_id,
                        s.created_at.timestamp_millis(),
                        s.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await?;
        Ok(server)
    }

    pub async fn get(&self, id: &str) -> Result<Option<CustomMcpServer>, ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                conn.query_row(
                    "SELECT id, name, description, type, command, args, url, headers, env, \
                     enabled, workspace_id, created_at, updated_at \
                     FROM custom_mcp_servers WHERE id = ?1",
                    rusqlite::params![id],
                    |row| Ok(row_to_server(row)),
                )
                .optional()
            })
            .await
    }

    pub async fn list(&self, workspace_id: Option<&str>) -> Result<Vec<CustomMcpServer>, ServerError> {
        if let Some(ws_id) = workspace_id {
            self.list_by_workspace(ws_id).await
        } else {
            self.list_all().await
        }
    }

    async fn list_by_workspace(&self, workspace_id: &str) -> Result<Vec<CustomMcpServer>, ServerError> {
        let ws = workspace_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, name, description, type, command, args, url, headers, env, \
                     enabled, workspace_id, created_at, updated_at \
                     FROM custom_mcp_servers \
                     WHERE workspace_id = ?1 OR workspace_id IS NULL \
                     ORDER BY created_at ASC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![ws], |row| Ok(row_to_server(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    async fn list_all(&self) -> Result<Vec<CustomMcpServer>, ServerError> {
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, name, description, type, command, args, url, headers, env, \
                     enabled, workspace_id, created_at, updated_at \
                     FROM custom_mcp_servers ORDER BY created_at ASC",
                )?;
                let rows = stmt
                    .query_map([], |row| Ok(row_to_server(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn update(
        &self,
        id: &str,
        input: UpdateCustomMcpServerInput,
    ) -> Result<Option<CustomMcpServer>, ServerError> {
        // fetch first
        let existing = match self.get(id).await? {
            Some(s) => s,
            None => return Ok(None),
        };

        let now = Utc::now();
        let updated = CustomMcpServer {
            id: existing.id.clone(),
            name: input.name.unwrap_or(existing.name),
            description: input.description.or(existing.description),
            server_type: input.server_type.unwrap_or(existing.server_type),
            command: input.command.or(existing.command),
            args: input.args.or(existing.args),
            url: input.url.or(existing.url),
            headers: input.headers.or(existing.headers),
            env: input.env.or(existing.env),
            enabled: input.enabled.unwrap_or(existing.enabled),
            workspace_id: existing.workspace_id,
            created_at: existing.created_at,
            updated_at: now,
        };
        let u = updated.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "UPDATE custom_mcp_servers SET \
                     name = ?2, description = ?3, type = ?4, command = ?5, args = ?6, \
                     url = ?7, headers = ?8, env = ?9, enabled = ?10, updated_at = ?11 \
                     WHERE id = ?1",
                    rusqlite::params![
                        u.id,
                        u.name,
                        u.description,
                        u.server_type.to_string(),
                        u.command,
                        u.args.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default()),
                        u.url,
                        u.headers.as_ref().map(|h| h.to_string()),
                        u.env.as_ref().map(|e| e.to_string()),
                        u.enabled as i64,
                        u.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await?;
        Ok(Some(updated))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, ServerError> {
        let id = id.to_string();
        let rows = self
            .db
            .with_conn_async(move |conn| {
                let n = conn.execute(
                    "DELETE FROM custom_mcp_servers WHERE id = ?1",
                    rusqlite::params![id],
                )?;
                Ok(n)
            })
            .await?;
        Ok(rows > 0)
    }
}

// ─── helper ────────────────────────────────────────────────────────────────

fn row_to_server(row: &rusqlite::Row<'_>) -> CustomMcpServer {
    use std::str::FromStr;

    let type_str: String = row.get(3).unwrap_or_default();
    let args_json: Option<String> = row.get(5).unwrap_or(None);
    let headers_json: Option<String> = row.get(7).unwrap_or(None);
    let env_json: Option<String> = row.get(8).unwrap_or(None);
    let enabled: i64 = row.get(9).unwrap_or(1);
    let created_ms: i64 = row.get(11).unwrap_or(0);
    let updated_ms: i64 = row.get(12).unwrap_or(0);

    CustomMcpServer {
        id: row.get(0).unwrap_or_default(),
        name: row.get(1).unwrap_or_default(),
        description: row.get(2).unwrap_or(None),
        server_type: McpServerType::from_str(&type_str).unwrap_or(McpServerType::Stdio),
        command: row.get(4).unwrap_or(None),
        args: args_json.and_then(|s| serde_json::from_str(&s).ok()),
        url: row.get(6).unwrap_or(None),
        headers: headers_json.and_then(|s| serde_json::from_str(&s).ok()),
        env: env_json.and_then(|s| serde_json::from_str(&s).ok()),
        enabled: enabled != 0,
        workspace_id: row.get(10).unwrap_or(None),
        created_at: chrono::DateTime::from_timestamp_millis(created_ms).unwrap_or_default(),
        updated_at: chrono::DateTime::from_timestamp_millis(updated_ms).unwrap_or_default(),
    }
}
