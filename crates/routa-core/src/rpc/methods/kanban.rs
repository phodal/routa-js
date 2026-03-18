//! RPC methods for Kanban board and card management.
//!
//! Methods:
//! - `kanban.listBoards`
//! - `kanban.createBoard`
//! - `kanban.getBoard`
//! - `kanban.updateBoard`
//! - `kanban.createCard`
//! - `kanban.moveCard`
//! - `kanban.updateCard`
//! - `kanban.deleteCard`
//! - `kanban.createColumn`
//! - `kanban.deleteColumn`
//! - `kanban.searchCards`
//! - `kanban.listCardsByColumn`
//! - `kanban.decomposeTasks`

use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

use crate::error::ServerError;
use crate::kanban::{set_task_column, sync_task_status_from_column, task_to_card, KanbanCard};
use crate::models::kanban::{default_kanban_board, KanbanBoard, KanbanColumn};
use crate::models::task::{Task, TaskPriority};
use crate::rpc::error::RpcError;
use crate::state::AppState;

fn default_workspace_id() -> String {
    "default".into()
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanColumnWithCards {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub position: i64,
    pub stage: String,
    pub cards: Vec<KanbanCard>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListBoardsParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
}

#[derive(Debug, Serialize)]
pub struct ListBoardsResult {
    pub boards: Vec<KanbanBoardSummary>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct KanbanBoardSummary {
    pub id: String,
    pub name: String,
    pub is_default: bool,
    pub column_count: usize,
}

pub async fn list_boards(
    state: &AppState,
    params: ListBoardsParams,
) -> Result<ListBoardsResult, RpcError> {
    ensure_workspace_exists(state, &params.workspace_id).await?;
    state
        .kanban_store
        .ensure_default_board(&params.workspace_id)
        .await?;
    let boards = state.kanban_store.list_by_workspace(&params.workspace_id).await?;
    Ok(ListBoardsResult {
        boards: boards
            .into_iter()
            .map(|board| KanbanBoardSummary {
                id: board.id,
                name: board.name,
                is_default: board.is_default,
                column_count: board.columns.len(),
            })
            .collect(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateBoardParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
    pub name: String,
    pub columns: Option<Vec<String>>,
    pub is_default: Option<bool>,
    pub id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateBoardResult {
    pub board: KanbanBoard,
}

pub async fn create_board(
    state: &AppState,
    params: CreateBoardParams,
) -> Result<CreateBoardResult, RpcError> {
    ensure_workspace_exists(state, &params.workspace_id).await?;
    let name = params.name.trim();
    if name.is_empty() {
        return Err(RpcError::BadRequest("board name cannot be blank".to_string()));
    }

    let want_default = params.is_default.unwrap_or(false);
    let mut board = default_kanban_board(params.workspace_id.clone());
    board.id = params.id.unwrap_or_else(|| uuid::Uuid::new_v4().to_string());
    board.name = name.to_string();
    // Always insert with is_default=false to avoid the unique partial index
    // violation when another default board already exists in the workspace.
    // set_default_for_workspace will flip the flag atomically afterwards.
    board.is_default = false;
    if let Some(columns) = params.columns {
        board.columns = build_columns_from_names(&columns)?;
    }
    board.created_at = Utc::now();
    board.updated_at = board.created_at;

    state.kanban_store.create(&board).await?;
    if want_default {
        state
            .kanban_store
            .set_default_for_workspace(&board.workspace_id, &board.id)
            .await?;
        board.is_default = true;
    }

    Ok(CreateBoardResult { board })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBoardParams {
    pub board_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GetBoardResult {
    pub id: String,
    pub workspace_id: String,
    pub name: String,
    pub is_default: bool,
    pub columns: Vec<KanbanColumnWithCards>,
    pub created_at: chrono::DateTime<Utc>,
    pub updated_at: chrono::DateTime<Utc>,
}

pub async fn get_board(state: &AppState, params: GetBoardParams) -> Result<GetBoardResult, RpcError> {
    let board = state
        .kanban_store
        .get(&params.board_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", params.board_id)))?;
    build_board_result(state, board).await
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBoardParams {
    pub board_id: String,
    pub name: Option<String>,
    pub columns: Option<Vec<KanbanColumn>>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct UpdateBoardResult {
    pub board: KanbanBoard,
}

pub async fn update_board(
    state: &AppState,
    params: UpdateBoardParams,
) -> Result<UpdateBoardResult, RpcError> {
    let mut board = state
        .kanban_store
        .get(&params.board_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", params.board_id)))?;

    if let Some(name) = params.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(RpcError::BadRequest("board name cannot be blank".to_string()));
        }
        board.name = trimmed.to_string();
    }

    if let Some(columns) = params.columns {
        board.columns = normalize_columns(columns)?;
    }

    if let Some(is_default) = params.is_default {
        board.is_default = is_default;
    }

    board.updated_at = Utc::now();
    state.kanban_store.update(&board).await?;
    if board.is_default {
        state
            .kanban_store
            .set_default_for_workspace(&board.workspace_id, &board.id)
            .await?;
        board = state
            .kanban_store
            .get(&board.id)
            .await?
            .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", params.board_id)))?;
    }

    Ok(UpdateBoardResult { board })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateCardParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
    pub board_id: Option<String>,
    pub column_id: Option<String>,
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct CreateCardResult {
    pub card: KanbanCard,
}

pub async fn create_card(
    state: &AppState,
    params: CreateCardParams,
) -> Result<CreateCardResult, RpcError> {
    let board = resolve_board(state, &params.workspace_id, params.board_id.as_deref()).await?;
    let target_column_id = params.column_id.unwrap_or_else(|| "backlog".to_string());
    ensure_column_exists(&board, &target_column_id)?;

    let title = params.title.trim();
    if title.is_empty() {
        return Err(RpcError::BadRequest("card title cannot be blank".to_string()));
    }

    let position = next_position_in_column(state, &board.workspace_id, &board.id, &target_column_id)
        .await?;
    let mut task = Task::new(
        uuid::Uuid::new_v4().to_string(),
        title.to_string(),
        params.description.unwrap_or_default(),
        board.workspace_id.clone(),
        None,
        None,
        None,
        None,
        None,
        None,
        None,
    );
    task.board_id = Some(board.id.clone());
    task.column_id = Some(target_column_id.clone());
    task.position = position;
    set_task_column(&mut task, target_column_id);
    task.priority = parse_priority(params.priority.as_deref())?;
    task.labels = params.labels.unwrap_or_default();
    task.updated_at = Utc::now();

    state.task_store.save(&task).await?;
    Ok(CreateCardResult {
        card: task_to_card(&task),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MoveCardParams {
    pub card_id: String,
    pub target_column_id: String,
    pub position: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct MoveCardResult {
    pub card: KanbanCard,
}

pub async fn move_card(state: &AppState, params: MoveCardParams) -> Result<MoveCardResult, RpcError> {
    let mut task = state
        .task_store
        .get(&params.card_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Card {} not found", params.card_id)))?;
    let board_id = task
        .board_id
        .clone()
        .ok_or_else(|| RpcError::BadRequest(format!("Card {} is not associated with a board", params.card_id)))?;
    let board = state
        .kanban_store
        .get(&board_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", board_id)))?;
    ensure_column_exists(&board, &params.target_column_id)?;

    task.column_id = Some(params.target_column_id.clone());
    task.position = match params.position {
        Some(position) if position >= 0 => position,
        Some(_) => {
            return Err(RpcError::BadRequest(
                "position must be greater than or equal to zero".to_string(),
            ))
        }
        None => next_position_in_column(
            state,
            &board.workspace_id,
            &board.id,
            &params.target_column_id,
        )
        .await?,
    };
    sync_task_status_from_column(&mut task);
    task.updated_at = Utc::now();

    state.task_store.save(&task).await?;
    Ok(MoveCardResult {
        card: task_to_card(&task),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCardParams {
    pub card_id: String,
    pub title: Option<String>,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct UpdateCardResult {
    pub card: KanbanCard,
}

pub async fn update_card(
    state: &AppState,
    params: UpdateCardParams,
) -> Result<UpdateCardResult, RpcError> {
    let mut task = state
        .task_store
        .get(&params.card_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Card {} not found", params.card_id)))?;

    if let Some(title) = params.title {
        let trimmed = title.trim();
        if trimmed.is_empty() {
            return Err(RpcError::BadRequest("card title cannot be blank".to_string()));
        }
        task.title = trimmed.to_string();
    }
    if let Some(description) = params.description {
        task.objective = description;
    }
    if params.priority.is_some() {
        task.priority = parse_priority(params.priority.as_deref())?;
    }
    if let Some(labels) = params.labels {
        task.labels = labels;
    }
    task.updated_at = Utc::now();

    state.task_store.save(&task).await?;
    Ok(UpdateCardResult {
        card: task_to_card(&task),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteCardParams {
    pub card_id: String,
}

#[derive(Debug, Serialize)]
pub struct DeleteCardResult {
    pub deleted: bool,
    pub card_id: String,
}

pub async fn delete_card(
    state: &AppState,
    params: DeleteCardParams,
) -> Result<DeleteCardResult, RpcError> {
    state.task_store.delete(&params.card_id).await?;
    Ok(DeleteCardResult {
        deleted: true,
        card_id: params.card_id,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateColumnParams {
    pub board_id: String,
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct CreateColumnResult {
    pub board: KanbanBoard,
}

pub async fn create_column(
    state: &AppState,
    params: CreateColumnParams,
) -> Result<CreateColumnResult, RpcError> {
    let mut board = state
        .kanban_store
        .get(&params.board_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", params.board_id)))?;
    let name = params.name.trim();
    if name.is_empty() {
        return Err(RpcError::BadRequest("column name cannot be blank".to_string()));
    }

    let column_id = slugify(name);
    if board.columns.iter().any(|column| column.id == column_id) {
        return Err(RpcError::BadRequest(format!(
            "Column already exists: {}",
            column_id
        )));
    }

    board.columns.push(KanbanColumn {
        id: column_id,
        name: name.to_string(),
        color: params.color,
        position: board.columns.len() as i64,
        stage: "backlog".to_string(),
        automation: None,
    });
    board.updated_at = Utc::now();
    state.kanban_store.update(&board).await?;

    Ok(CreateColumnResult { board })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteColumnParams {
    pub board_id: String,
    pub column_id: String,
    pub delete_cards: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeleteColumnResult {
    pub deleted: bool,
    pub column_id: String,
    pub cards_deleted: usize,
    pub cards_moved: usize,
    pub board: KanbanBoard,
}

pub async fn delete_column(
    state: &AppState,
    params: DeleteColumnParams,
) -> Result<DeleteColumnResult, RpcError> {
    if params.column_id == "backlog" {
        return Err(RpcError::BadRequest(
            "backlog column cannot be deleted".to_string(),
        ));
    }

    let mut board = state
        .kanban_store
        .get(&params.board_id)
        .await?
        .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", params.board_id)))?;
    let column_index = board
        .columns
        .iter()
        .position(|column| column.id == params.column_id)
        .ok_or_else(|| RpcError::NotFound(format!("Column {} not found", params.column_id)))?;

    let tasks = state.task_store.list_by_workspace(&board.workspace_id).await?;
    let column_tasks: Vec<Task> = tasks
        .into_iter()
        .filter(|task| {
            task.board_id.as_deref() == Some(board.id.as_str())
                && task.column_id.as_deref().unwrap_or("backlog") == params.column_id
        })
        .collect();

    let delete_cards = params.delete_cards.unwrap_or(false);
    let mut cards_deleted = 0usize;
    let mut cards_moved = 0usize;

    for mut task in column_tasks {
        if delete_cards {
            state.task_store.delete(&task.id).await?;
            cards_deleted += 1;
        } else {
            set_task_column(&mut task, "backlog");
            task.position = next_position_in_column(state, &board.workspace_id, &board.id, "backlog")
                .await?;
            task.updated_at = Utc::now();
            state.task_store.save(&task).await?;
            cards_moved += 1;
        }
    }

    board.columns.remove(column_index);
    for (index, column) in board.columns.iter_mut().enumerate() {
        column.position = index as i64;
    }
    board.updated_at = Utc::now();
    state.kanban_store.update(&board).await?;

    Ok(DeleteColumnResult {
        deleted: true,
        column_id: params.column_id,
        cards_deleted,
        cards_moved,
        board,
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SearchCardsParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
    pub query: String,
    pub board_id: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SearchCardsResult {
    pub cards: Vec<KanbanCard>,
}

pub async fn search_cards(
    state: &AppState,
    params: SearchCardsParams,
) -> Result<SearchCardsResult, RpcError> {
    ensure_workspace_exists(state, &params.workspace_id).await?;
    let query = params.query.trim().to_ascii_lowercase();
    if query.is_empty() {
        return Err(RpcError::BadRequest("query cannot be blank".to_string()));
    }

    let tasks = state.task_store.list_by_workspace(&params.workspace_id).await?;
    let cards = tasks
        .into_iter()
        .filter(|task| {
            if let Some(board_id) = params.board_id.as_deref() {
                if task.board_id.as_deref() != Some(board_id) {
                    return false;
                }
            }
            task.board_id.is_some()
                && (task.title.to_ascii_lowercase().contains(&query)
                    || task.labels.iter().any(|label| label.to_ascii_lowercase().contains(&query))
                    || task
                        .assignee
                        .as_ref()
                        .map(|assignee| assignee.to_ascii_lowercase().contains(&query))
                        .unwrap_or(false))
        })
        .map(|task| task_to_card(&task))
        .collect();

    Ok(SearchCardsResult { cards })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCardsByColumnParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
    pub board_id: Option<String>,
    pub column_id: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ListCardsByColumnResult {
    pub board_id: String,
    pub column_id: String,
    pub column_name: String,
    pub cards: Vec<KanbanCard>,
}

pub async fn list_cards_by_column(
    state: &AppState,
    params: ListCardsByColumnParams,
) -> Result<ListCardsByColumnResult, RpcError> {
    let board = resolve_board(state, &params.workspace_id, params.board_id.as_deref()).await?;
    let column = board
        .columns
        .iter()
        .find(|column| column.id == params.column_id)
        .ok_or_else(|| RpcError::NotFound(format!("Column {} not found", params.column_id)))?;
    let mut tasks = tasks_for_board(state, &board).await?;
    tasks.retain(|task| task.column_id.as_deref().unwrap_or("backlog") == params.column_id);
    tasks.sort_by_key(|task| task.position);

    Ok(ListCardsByColumnResult {
        board_id: board.id,
        column_id: params.column_id,
        column_name: column.name.clone(),
        cards: tasks.into_iter().map(|task| task_to_card(&task)).collect(),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecomposeTaskItem {
    pub title: String,
    pub description: Option<String>,
    pub priority: Option<String>,
    pub labels: Option<Vec<String>>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DecomposeTasksParams {
    #[serde(default = "default_workspace_id")]
    pub workspace_id: String,
    pub board_id: Option<String>,
    pub column_id: Option<String>,
    pub tasks: Vec<DecomposeTaskItem>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DecomposeTasksResult {
    pub count: usize,
    pub cards: Vec<KanbanCard>,
}

pub async fn decompose_tasks(
    state: &AppState,
    params: DecomposeTasksParams,
) -> Result<DecomposeTasksResult, RpcError> {
    if params.tasks.is_empty() {
        return Err(RpcError::BadRequest("tasks array cannot be empty".to_string()));
    }
    let board = resolve_board(state, &params.workspace_id, params.board_id.as_deref()).await?;
    let target_column_id = params.column_id.unwrap_or_else(|| "backlog".to_string());
    ensure_column_exists(&board, &target_column_id)?;

    let mut position =
        next_position_in_column(state, &board.workspace_id, &board.id, &target_column_id).await?;
    let mut created_cards = Vec::with_capacity(params.tasks.len());

    for item in params.tasks {
        let title = item.title.trim();
        if title.is_empty() {
            return Err(RpcError::BadRequest(
                "decomposed task title cannot be blank".to_string(),
            ));
        }
        let mut task = Task::new(
            uuid::Uuid::new_v4().to_string(),
            title.to_string(),
            item.description.unwrap_or_default(),
            board.workspace_id.clone(),
            None,
            None,
            None,
            None,
            None,
            None,
            None,
        );
        task.board_id = Some(board.id.clone());
        task.column_id = Some(target_column_id.clone());
        task.position = position;
        set_task_column(&mut task, target_column_id.clone());
        task.priority = parse_priority(item.priority.as_deref())?;
        task.labels = item.labels.unwrap_or_default();
        task.updated_at = Utc::now();
        state.task_store.save(&task).await?;
        created_cards.push(task_to_card(&task));
        position += 1;
    }

    Ok(DecomposeTasksResult {
        count: created_cards.len(),
        cards: created_cards,
    })
}

async fn ensure_workspace_exists(state: &AppState, workspace_id: &str) -> Result<(), ServerError> {
    if workspace_id == "default" {
        state.workspace_store.ensure_default().await?;
        return Ok(());
    }

    if state.workspace_store.get(workspace_id).await?.is_some() {
        Ok(())
    } else {
        Err(ServerError::NotFound(format!(
            "Workspace {} not found",
            workspace_id
        )))
    }
}

async fn resolve_board(
    state: &AppState,
    workspace_id: &str,
    board_id: Option<&str>,
) -> Result<KanbanBoard, RpcError> {
    if let Some(board_id) = board_id {
        return state
            .kanban_store
            .get(board_id)
            .await?
            .ok_or_else(|| RpcError::NotFound(format!("Board {} not found", board_id)));
    }

    ensure_workspace_exists(state, workspace_id).await?;
    state
        .kanban_store
        .ensure_default_board(workspace_id)
        .await
        .map_err(Into::into)
}

async fn tasks_for_board(state: &AppState, board: &KanbanBoard) -> Result<Vec<Task>, RpcError> {
    Ok(state
        .task_store
        .list_by_workspace(&board.workspace_id)
        .await?
        .into_iter()
        .filter(|task| task.board_id.as_deref() == Some(board.id.as_str()))
        .collect())
}

async fn next_position_in_column(
    state: &AppState,
    workspace_id: &str,
    board_id: &str,
    column_id: &str,
) -> Result<i64, RpcError> {
    let count = state
        .task_store
        .list_by_workspace(workspace_id)
        .await?
        .into_iter()
        .filter(|task| {
            task.board_id.as_deref() == Some(board_id)
                && task.column_id.as_deref().unwrap_or("backlog") == column_id
        })
        .count();
    Ok(count as i64)
}

async fn build_board_result(state: &AppState, board: KanbanBoard) -> Result<GetBoardResult, RpcError> {
    let mut tasks = tasks_for_board(state, &board).await?;
    tasks.sort_by_key(|task| task.position);

    let columns = board
        .columns
        .iter()
        .map(|column| {
            let mut cards: Vec<KanbanCard> = tasks
                .iter()
                .filter(|task| task.column_id.as_deref().unwrap_or("backlog") == column.id)
                .map(task_to_card)
                .collect();
            cards.sort_by_key(|card| card.position);
            KanbanColumnWithCards {
                id: column.id.clone(),
                name: column.name.clone(),
                color: column.color.clone(),
                position: column.position,
                stage: column.stage.clone(),
                cards,
            }
        })
        .collect();

    Ok(GetBoardResult {
        id: board.id,
        workspace_id: board.workspace_id,
        name: board.name,
        is_default: board.is_default,
        columns,
        created_at: board.created_at,
        updated_at: board.updated_at,
    })
}

fn ensure_column_exists(board: &KanbanBoard, column_id: &str) -> Result<(), RpcError> {
    if board.columns.iter().any(|column| column.id == column_id) {
        Ok(())
    } else {
        Err(RpcError::NotFound(format!("Column {} not found", column_id)))
    }
}

fn build_columns_from_names(names: &[String]) -> Result<Vec<KanbanColumn>, RpcError> {
    if names.is_empty() {
        return Err(RpcError::BadRequest(
            "columns cannot be an empty array".to_string(),
        ));
    }

    let mut seen = HashSet::new();
    let mut columns = Vec::with_capacity(names.len());
    for (index, name) in names.iter().enumerate() {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err(RpcError::BadRequest(
                "column names cannot be blank".to_string(),
            ));
        }
        let id = slugify(trimmed);
        if !seen.insert(id.clone()) {
            return Err(RpcError::BadRequest(format!(
                "duplicate column id generated from name: {}",
                trimmed
            )));
        }
        columns.push(KanbanColumn {
            id,
            name: trimmed.to_string(),
            color: None,
            position: index as i64,
            stage: "backlog".to_string(),
            automation: None,
        });
    }
    Ok(columns)
}

fn normalize_columns(columns: Vec<KanbanColumn>) -> Result<Vec<KanbanColumn>, RpcError> {
    if columns.is_empty() {
        return Err(RpcError::BadRequest(
            "columns cannot be an empty array".to_string(),
        ));
    }

    let mut seen = HashSet::new();
    let mut normalized = Vec::with_capacity(columns.len());
    for (index, mut column) in columns.into_iter().enumerate() {
        column.id = column.id.trim().to_string();
        column.name = column.name.trim().to_string();
        if column.id.is_empty() || column.name.is_empty() {
            return Err(RpcError::BadRequest(
                "column id and name cannot be blank".to_string(),
            ));
        }
        if !seen.insert(column.id.clone()) {
            return Err(RpcError::BadRequest(format!(
                "duplicate column id: {}",
                column.id
            )));
        }
        column.position = index as i64;
        normalized.push(column);
    }
    Ok(normalized)
}

fn parse_priority(priority: Option<&str>) -> Result<Option<TaskPriority>, RpcError> {
    match priority {
        Some(priority) => TaskPriority::from_str(priority)
            .map(Some)
            .ok_or_else(|| RpcError::BadRequest(format!("Invalid priority: {}", priority))),
        None => Ok(None),
    }
}

fn slugify(value: &str) -> String {
    value
        .split_whitespace()
        .map(|segment| segment.to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("-")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::Database;
    use crate::state::AppStateInner;
    use std::sync::Arc;

    async fn setup_state() -> AppState {
        let db = Database::open_in_memory().expect("in-memory db should open");
        let state: AppState = Arc::new(AppStateInner::new(db));
        state
            .workspace_store
            .ensure_default()
            .await
            .expect("default workspace should exist");
        state
    }

    #[tokio::test]
    async fn list_boards_ensures_default_board_exists() {
        let state = setup_state().await;

        let result = list_boards(
            &state,
            ListBoardsParams {
                workspace_id: "default".to_string(),
            },
        )
        .await
        .expect("list boards should succeed");

        assert_eq!(result.boards.len(), 1);
        assert!(result.boards[0].is_default);
        assert!(result.boards[0].column_count > 0);
    }

    #[tokio::test]
    async fn create_card_without_board_id_uses_default_board() {
        let state = setup_state().await;
        let boards = list_boards(
            &state,
            ListBoardsParams {
                workspace_id: "default".to_string(),
            },
        )
        .await
        .expect("list boards should succeed");
        let default_board_id = boards.boards[0].id.clone();

        let created = create_card(
            &state,
            CreateCardParams {
                workspace_id: "default".to_string(),
                board_id: None,
                column_id: Some("backlog".to_string()),
                title: "Implement RPC".to_string(),
                description: Some("wire core methods".to_string()),
                priority: Some("high".to_string()),
                labels: Some(vec!["rpc".to_string(), "kanban".to_string()]),
            },
        )
        .await
        .expect("create card should succeed");

        let board_view = get_board(
            &state,
            GetBoardParams {
                board_id: default_board_id,
            },
        )
        .await
        .expect("get board should succeed");

        let backlog = board_view
            .columns
            .iter()
            .find(|column| column.id == "backlog")
            .expect("backlog column should exist");
        assert_eq!(backlog.cards.len(), 1);
        assert_eq!(backlog.cards[0].id, created.card.id);
        assert_eq!(backlog.cards[0].priority.as_deref(), Some("high"));
    }

    #[tokio::test]
    async fn move_card_updates_status_and_rejects_negative_position() {
        let state = setup_state().await;
        let created = create_card(
            &state,
            CreateCardParams {
                workspace_id: "default".to_string(),
                board_id: None,
                column_id: Some("backlog".to_string()),
                title: "Move me".to_string(),
                description: None,
                priority: None,
                labels: None,
            },
        )
        .await
        .expect("create card should succeed");

        let moved = move_card(
            &state,
            MoveCardParams {
                card_id: created.card.id.clone(),
                target_column_id: "dev".to_string(),
                position: None,
            },
        )
        .await
        .expect("move card should succeed");
        assert_eq!(moved.card.column_id, "dev");
        assert_eq!(moved.card.status, "IN_PROGRESS");

        let err = move_card(
            &state,
            MoveCardParams {
                card_id: created.card.id,
                target_column_id: "review".to_string(),
                position: Some(-1),
            },
        )
        .await
        .expect_err("negative position should fail");
        assert!(matches!(err, RpcError::BadRequest(_)));
    }

    #[tokio::test]
    async fn delete_column_moves_cards_to_backlog_when_not_deleting_cards() {
        let state = setup_state().await;
        let created = create_card(
            &state,
            CreateCardParams {
                workspace_id: "default".to_string(),
                board_id: None,
                column_id: Some("todo".to_string()),
                title: "Todo card".to_string(),
                description: None,
                priority: None,
                labels: None,
            },
        )
        .await
        .expect("create card should succeed");

        let board_before = list_boards(
            &state,
            ListBoardsParams {
                workspace_id: "default".to_string(),
            },
        )
        .await
        .expect("list boards should succeed");
        let board_id = board_before.boards[0].id.clone();

        let result = delete_column(
            &state,
            DeleteColumnParams {
                board_id: board_id.clone(),
                column_id: "todo".to_string(),
                delete_cards: Some(false),
            },
        )
        .await
        .expect("delete column should succeed");

        assert!(result.deleted);
        assert_eq!(result.cards_moved, 1);
        assert_eq!(result.cards_deleted, 0);
        assert!(!result.board.columns.iter().any(|column| column.id == "todo"));

        let task = state
            .task_store
            .get(&created.card.id)
            .await
            .expect("task get should succeed")
            .expect("task should still exist");
        assert_eq!(task.column_id.as_deref(), Some("backlog"));
    }

    #[tokio::test]
    async fn search_list_by_column_and_decompose_tasks_work() {
        let state = setup_state().await;
        let first = create_card(
            &state,
            CreateCardParams {
                workspace_id: "default".to_string(),
                board_id: None,
                column_id: Some("backlog".to_string()),
                title: "Searchable API card".to_string(),
                description: None,
                priority: None,
                labels: Some(vec!["api".to_string()]),
            },
        )
        .await
        .expect("create card should succeed");
        let second = create_card(
            &state,
            CreateCardParams {
                workspace_id: "default".to_string(),
                board_id: None,
                column_id: Some("backlog".to_string()),
                title: "Another card".to_string(),
                description: None,
                priority: None,
                labels: None,
            },
        )
        .await
        .expect("create card should succeed");
        move_card(
            &state,
            MoveCardParams {
                card_id: second.card.id.clone(),
                target_column_id: "dev".to_string(),
                position: Some(0),
            },
        )
        .await
        .expect("move should succeed");

        let boards = list_boards(
            &state,
            ListBoardsParams {
                workspace_id: "default".to_string(),
            },
        )
        .await
        .expect("list boards should succeed");
        let board_id = boards.boards[0].id.clone();

        let searched = search_cards(
            &state,
            SearchCardsParams {
                workspace_id: "default".to_string(),
                query: "api".to_string(),
                board_id: Some(board_id.clone()),
            },
        )
        .await
        .expect("search should succeed");
        assert_eq!(searched.cards.len(), 1);
        assert_eq!(searched.cards[0].id, first.card.id);

        let dev_cards = list_cards_by_column(
            &state,
            ListCardsByColumnParams {
                workspace_id: "default".to_string(),
                board_id: Some(board_id.clone()),
                column_id: "dev".to_string(),
            },
        )
        .await
        .expect("list cards by column should succeed");
        assert_eq!(dev_cards.cards.len(), 1);
        assert_eq!(dev_cards.cards[0].id, second.card.id);

        let decomposed = decompose_tasks(
            &state,
            DecomposeTasksParams {
                workspace_id: "default".to_string(),
                board_id: Some(board_id),
                column_id: Some("backlog".to_string()),
                tasks: vec![
                    DecomposeTaskItem {
                        title: "Split 1".to_string(),
                        description: Some("a".to_string()),
                        priority: Some("low".to_string()),
                        labels: None,
                    },
                    DecomposeTaskItem {
                        title: "Split 2".to_string(),
                        description: None,
                        priority: Some("urgent".to_string()),
                        labels: Some(vec!["bulk".to_string()]),
                    },
                ],
            },
        )
        .await
        .expect("decompose should succeed");
        assert_eq!(decomposed.count, 2);
        assert_eq!(decomposed.cards.len(), 2);
    }
}
