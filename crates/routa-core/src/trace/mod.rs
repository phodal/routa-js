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
//!
//! Storage: `<workspace>/.routa/traces/{day}/traces-{datetime}.jsonl`

mod types;
mod writer;
mod reader;

pub use types::*;
pub use writer::*;
pub use reader::*;

