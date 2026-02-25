//! Agent Trace — Domain model for tracking agent activities.
//!
//! Implements the Agent Trace specification (based on https://github.com/cursor/agent-trace)
//! to record which model/session/tool affected which files and when.
//!
//! # Architecture
//!
//! - `TraceRecord` — The main trace event with session, tool, file info
//! - `TraceFile` — A file touched by the agent with optional range info
//! - `TraceRange` — Line/column range within a file
//! - `Contributor` — The model/provider that produced the trace
//! - `TraceWriter` — JSONL append-only writer for trace storage
//! - `TraceReader` — Query and read traces from filesystem
//! - `extract_files_from_tool_call` — Extract file ranges from tool parameters
//! - `get_vcs_context` — Get Git context (revision, branch, repo_root)
//!
//! Storage: `<workspace>/.routa/traces/{day}/traces-{datetime}.jsonl`

mod types;
mod writer;
mod reader;
mod file_extractor;
mod vcs;

pub use types::*;
pub use writer::*;
pub use reader::*;
pub use file_extractor::{extract_files_from_tool_call, compute_content_hash};
pub use vcs::{get_vcs_context, get_vcs_context_light};

