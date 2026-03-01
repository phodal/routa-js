use chrono::Utc;
use rusqlite::OptionalExtension;
use uuid::Uuid;

use crate::db::Database;
use crate::error::ServerError;
use crate::models::schedule::{CreateScheduleInput, Schedule, UpdateScheduleInput};

#[derive(Clone)]
pub struct ScheduleStore {
    db: Database,
}

impl ScheduleStore {
    pub fn new(db: Database) -> Self {
        Self { db }
    }

    pub async fn create(&self, input: CreateScheduleInput) -> Result<Schedule, ServerError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let s = Schedule {
            id: id.clone(),
            name: input.name,
            cron_expr: input.cron_expr,
            task_prompt: input.task_prompt,
            agent_id: input.agent_id,
            workspace_id: input.workspace_id,
            enabled: input.enabled,
            last_run_at: None,
            next_run_at: input.next_run_at,
            last_task_id: None,
            prompt_template: input.prompt_template,
            created_at: now,
            updated_at: now,
        };
        let sc = s.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "INSERT INTO schedules (id, name, cron_expr, task_prompt, agent_id, workspace_id, \
                     enabled, last_run_at, next_run_at, last_task_id, prompt_template, created_at, updated_at) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
                    rusqlite::params![
                        sc.id,
                        sc.name,
                        sc.cron_expr,
                        sc.task_prompt,
                        sc.agent_id,
                        sc.workspace_id,
                        sc.enabled as i64,
                        sc.last_run_at.map(|t| t.timestamp_millis()),
                        sc.next_run_at.map(|t| t.timestamp_millis()),
                        sc.last_task_id,
                        sc.prompt_template,
                        sc.created_at.timestamp_millis(),
                        sc.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await?;
        Ok(s)
    }

    pub async fn get(&self, id: &str) -> Result<Option<Schedule>, ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                conn.query_row(
                    "SELECT id, name, cron_expr, task_prompt, agent_id, workspace_id, enabled, \
                     last_run_at, next_run_at, last_task_id, prompt_template, created_at, updated_at \
                     FROM schedules WHERE id = ?1",
                    rusqlite::params![id],
                    |row| Ok(row_to_schedule(row)),
                )
                .optional()
            })
            .await
    }

    pub async fn list_by_workspace(&self, workspace_id: &str) -> Result<Vec<Schedule>, ServerError> {
        let ws = workspace_id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, name, cron_expr, task_prompt, agent_id, workspace_id, enabled, \
                     last_run_at, next_run_at, last_task_id, prompt_template, created_at, updated_at \
                     FROM schedules WHERE workspace_id = ?1 ORDER BY created_at DESC",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![ws], |row| Ok(row_to_schedule(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn list_due(&self) -> Result<Vec<Schedule>, ServerError> {
        let now_ms = Utc::now().timestamp_millis();
        self.db
            .with_conn_async(move |conn| {
                let mut stmt = conn.prepare(
                    "SELECT id, name, cron_expr, task_prompt, agent_id, workspace_id, enabled, \
                     last_run_at, next_run_at, last_task_id, prompt_template, created_at, updated_at \
                     FROM schedules WHERE enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?1",
                )?;
                let rows = stmt
                    .query_map(rusqlite::params![now_ms], |row| Ok(row_to_schedule(row)))?
                    .collect::<Result<Vec<_>, _>>()?;
                Ok(rows)
            })
            .await
    }

    pub async fn update(&self, id: &str, input: UpdateScheduleInput) -> Result<Option<Schedule>, ServerError> {
        // Fetch first, then apply patches, then save
        let existing = self.get(id).await?;
        let Some(mut s) = existing else { return Ok(None) };
        if let Some(v) = input.name { s.name = v; }
        if let Some(v) = input.cron_expr { s.cron_expr = v; }
        if let Some(v) = input.task_prompt { s.task_prompt = v; }
        if let Some(v) = input.agent_id { s.agent_id = v; }
        if let Some(v) = input.enabled { s.enabled = v; }
        if let Some(v) = input.next_run_at { s.next_run_at = Some(v); }
        if let Some(v) = input.last_run_at { s.last_run_at = Some(v); }
        if let Some(v) = input.last_task_id { s.last_task_id = Some(v); }
        if let Some(v) = input.prompt_template { s.prompt_template = Some(v); }
        s.updated_at = Utc::now();
        let sc = s.clone();
        self.db
            .with_conn_async(move |conn| {
                conn.execute(
                    "UPDATE schedules SET name=?2, cron_expr=?3, task_prompt=?4, agent_id=?5, \
                     enabled=?6, last_run_at=?7, next_run_at=?8, last_task_id=?9, prompt_template=?10, \
                     updated_at=?11 WHERE id=?1",
                    rusqlite::params![
                        sc.id,
                        sc.name,
                        sc.cron_expr,
                        sc.task_prompt,
                        sc.agent_id,
                        sc.enabled as i64,
                        sc.last_run_at.map(|t| t.timestamp_millis()),
                        sc.next_run_at.map(|t| t.timestamp_millis()),
                        sc.last_task_id,
                        sc.prompt_template,
                        sc.updated_at.timestamp_millis(),
                    ],
                )?;
                Ok(())
            })
            .await?;
        Ok(Some(s))
    }

    pub async fn delete(&self, id: &str) -> Result<bool, ServerError> {
        let id = id.to_string();
        self.db
            .with_conn_async(move |conn| {
                let n = conn.execute("DELETE FROM schedules WHERE id = ?1", rusqlite::params![id])?;
                Ok(n > 0)
            })
            .await
    }
}

fn row_to_schedule(row: &rusqlite::Row<'_>) -> Schedule {
    use chrono::TimeZone;
    let to_dt = |ms: Option<i64>| {
        ms.and_then(|v| Utc.timestamp_millis_opt(v).single())
    };

    Schedule {
        id: row.get(0).unwrap_or_default(),
        name: row.get(1).unwrap_or_default(),
        cron_expr: row.get(2).unwrap_or_default(),
        task_prompt: row.get(3).unwrap_or_default(),
        agent_id: row.get(4).unwrap_or_default(),
        workspace_id: row.get(5).unwrap_or_default(),
        enabled: row.get::<_, i64>(6).unwrap_or(0) != 0,
        last_run_at: to_dt(row.get(7).unwrap_or(None)),
        next_run_at: to_dt(row.get(8).unwrap_or(None)),
        last_task_id: row.get(9).unwrap_or(None),
        prompt_template: row.get(10).unwrap_or(None),
        created_at: to_dt(row.get(11).ok()).unwrap_or_else(Utc::now),
        updated_at: to_dt(row.get(12).ok()).unwrap_or_else(Utc::now),
    }
}
