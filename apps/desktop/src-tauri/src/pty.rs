//! PTY Manager for Tauri Desktop
//!
//! Provides pseudo-terminal (PTY) support for interactive terminal sessions.
//! Uses portable-pty for cross-platform PTY support (macOS, Linux, Windows).
//!
//! This module enables xterm.js in the frontend to display real interactive
//! terminals with proper ANSI escape code handling, cursor movement, etc.

use portable_pty::{native_pty_system, CommandBuilder, PtyPair, PtySize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::sync::Arc;
use tauri::async_runtime::Mutex as AsyncMutex;
use tauri::{AppHandle, Emitter, State};

/// A single PTY session with its reader/writer handles.
pub struct PtySession {
    pub pty_pair: PtyPair,
    pub writer: Box<dyn Write + Send>,
    pub reader: BufReader<Box<dyn Read + Send>>,
    pub cwd: String,
    pub command: String,
}

/// Manages multiple PTY sessions.
pub struct PtyManager {
    sessions: HashMap<String, PtySession>,
    next_id: u64,
}

impl PtyManager {
    pub fn new() -> Self {
        Self {
            sessions: HashMap::new(),
            next_id: 1,
        }
    }

    /// Create a new PTY session.
    pub fn create(
        &mut self,
        command: Option<String>,
        args: Option<Vec<String>>,
        cwd: Option<String>,
        env: Option<HashMap<String, String>>,
        rows: u16,
        cols: u16,
    ) -> Result<String, String> {
        let pty_system = native_pty_system();

        let pty_pair = pty_system
            .openpty(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone PTY reader: {}", e))?;
        let writer = pty_pair
            .master
            .take_writer()
            .map_err(|e| format!("Failed to take PTY writer: {}", e))?;

        // Build the command
        let cmd_str = command.as_deref().unwrap_or(if cfg!(windows) {
            "powershell.exe"
        } else {
            "/bin/bash"
        });

        let mut cmd = CommandBuilder::new(cmd_str);

        // Add arguments
        if let Some(ref args) = args {
            for arg in args {
                cmd.arg(arg);
            }
        }

        // Set working directory
        let working_dir = cwd.clone().unwrap_or_else(|| {
            std::env::current_dir()
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| "/".to_string())
        });
        cmd.cwd(&working_dir);

        // Set TERM environment variable
        if cfg!(windows) {
            cmd.env("TERM", "cygwin");
        } else {
            cmd.env("TERM", "xterm-256color");
        }

        // Add custom environment variables
        if let Some(env_vars) = env {
            for (key, value) in env_vars {
                cmd.env(key, value);
            }
        }

        // Spawn the command in the PTY
        let _child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command in PTY: {}", e))?;

        let session_id = format!("pty-{}", self.next_id);
        self.next_id += 1;

        let session = PtySession {
            pty_pair,
            writer,
            reader: BufReader::new(reader),
            cwd: working_dir,
            command: cmd_str.to_string(),
        };

        self.sessions.insert(session_id.clone(), session);

        Ok(session_id)
    }

    /// Write data to a PTY session.
    pub fn write(&mut self, session_id: &str, data: &str) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("PTY session not found: {}", session_id))?;

        write!(session.writer, "{}", data)
            .map_err(|e| format!("Failed to write to PTY: {}", e))?;

        session
            .writer
            .flush()
            .map_err(|e| format!("Failed to flush PTY: {}", e))?;

        Ok(())
    }

    /// Read available data from a PTY session.
    pub fn read(&mut self, session_id: &str) -> Result<Option<String>, String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("PTY session not found: {}", session_id))?;

        let data = session.reader.fill_buf().map_err(|e| {
            format!("Failed to read from PTY: {}", e)
        })?;

        if data.is_empty() {
            return Ok(None);
        }

        let text = String::from_utf8_lossy(data).to_string();
        let len = data.len();
        session.reader.consume(len);

        Ok(Some(text))
    }

    /// Resize a PTY session.
    pub fn resize(&mut self, session_id: &str, rows: u16, cols: u16) -> Result<(), String> {
        let session = self
            .sessions
            .get_mut(session_id)
            .ok_or_else(|| format!("PTY session not found: {}", session_id))?;

        session
            .pty_pair
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to resize PTY: {}", e))
    }

    /// Kill/close a PTY session.
    pub fn kill(&mut self, session_id: &str) -> Result<(), String> {
        self.sessions
            .remove(session_id)
            .ok_or_else(|| format!("PTY session not found: {}", session_id))?;
        Ok(())
    }

    /// List all active PTY sessions.
    pub fn list(&self) -> Vec<PtySessionInfo> {
        self.sessions
            .iter()
            .map(|(id, session)| PtySessionInfo {
                session_id: id.clone(),
                command: session.command.clone(),
                cwd: session.cwd.clone(),
            })
            .collect()
    }
}

/// Information about a PTY session (for listing).
#[derive(serde::Serialize, Clone)]
pub struct PtySessionInfo {
    pub session_id: String,
    pub command: String,
    pub cwd: String,
}

/// Shared PTY state for Tauri commands.
pub struct PtyState {
    pub manager: Arc<AsyncMutex<PtyManager>>,
}

impl PtyState {
    pub fn new() -> Self {
        Self {
            manager: Arc::new(AsyncMutex::new(PtyManager::new())),
        }
    }
}

// ─── Tauri Commands ──────────────────────────────────────────────────────────

/// Create a new PTY session.
#[tauri::command]
pub async fn pty_create(
    state: State<'_, PtyState>,
    command: Option<String>,
    args: Option<Vec<String>>,
    cwd: Option<String>,
    env: Option<HashMap<String, String>>,
    rows: Option<u16>,
    cols: Option<u16>,
) -> Result<String, String> {
    let mut manager = state.manager.lock().await;
    manager.create(
        command,
        args,
        cwd,
        env,
        rows.unwrap_or(24),
        cols.unwrap_or(80),
    )
}

/// Write data to a PTY session.
#[tauri::command]
pub async fn pty_write(
    state: State<'_, PtyState>,
    session_id: String,
    data: String,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager.write(&session_id, &data)
}

/// Read available data from a PTY session.
#[tauri::command]
pub async fn pty_read(
    state: State<'_, PtyState>,
    session_id: String,
) -> Result<Option<String>, String> {
    let mut manager = state.manager.lock().await;
    manager.read(&session_id)
}

/// Resize a PTY session.
#[tauri::command]
pub async fn pty_resize(
    state: State<'_, PtyState>,
    session_id: String,
    rows: u16,
    cols: u16,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager.resize(&session_id, rows, cols)
}

/// Kill/close a PTY session.
#[tauri::command]
pub async fn pty_kill(
    state: State<'_, PtyState>,
    session_id: String,
) -> Result<(), String> {
    let mut manager = state.manager.lock().await;
    manager.kill(&session_id)
}

/// List all active PTY sessions.
#[tauri::command]
pub async fn pty_list(state: State<'_, PtyState>) -> Result<Vec<PtySessionInfo>, String> {
    let manager = state.manager.lock().await;
    Ok(manager.list())
}

