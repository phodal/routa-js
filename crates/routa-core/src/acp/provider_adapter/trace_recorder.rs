//! Trace Recorder
//!
//! Records traces from normalized session updates.
//! Handles deferred input patterns using a pending tool calls buffer.

use std::collections::HashMap;

use crate::trace::{
    TraceRecord, TraceWriter, TraceEventType, Contributor, TraceConversation, TraceTool,
};
use super::types::{
    NormalizedSessionUpdate, NormalizedEventType, NormalizedToolCall, ToolStatus,
};

/// Pending tool call waiting for input.
#[derive(Debug)]
struct PendingToolCall {
    tool_call_id: String,
    name: String,
    title: Option<String>,
    #[allow(dead_code)]
    provider: String,
    traced: bool,
}

/// TraceRecorder handles recording traces from session updates.
/// It manages pending tool calls for providers that send input in updates.
pub struct TraceRecorder {
    /// Buffer for pending tool calls awaiting input
    pending_tool_calls: HashMap<String, PendingToolCall>,
    /// Buffer for accumulating message chunks
    message_buffer: HashMap<String, String>,
    /// Buffer for accumulating thought chunks
    thought_buffer: HashMap<String, String>,
}

impl TraceRecorder {
    pub fn new() -> Self {
        Self {
            pending_tool_calls: HashMap::new(),
            message_buffer: HashMap::new(),
            thought_buffer: HashMap::new(),
        }
    }

    /// Record a trace from a normalized session update.
    pub async fn record_from_update(
        &mut self,
        update: &NormalizedSessionUpdate,
        cwd: &str,
    ) {
        match update.event_type {
            NormalizedEventType::ToolCall => self.handle_tool_call(update, cwd).await,
            NormalizedEventType::ToolCallUpdate => self.handle_tool_call_update(update, cwd).await,
            NormalizedEventType::AgentMessage => self.handle_agent_message(update, cwd).await,
            NormalizedEventType::AgentThought => self.handle_agent_thought(update, cwd).await,
            NormalizedEventType::UserMessage => self.handle_user_message(update, cwd).await,
            NormalizedEventType::TurnComplete => self.flush_buffers(&update.session_id, cwd, &update.provider).await,
            NormalizedEventType::PlanUpdate | NormalizedEventType::Error => {}
        }
    }

    async fn handle_tool_call(&mut self, update: &NormalizedSessionUpdate, cwd: &str) {
        let Some(tool_call) = &update.tool_call else { return };

        if tool_call.input_finalized {
            // Input is ready, record immediately
            self.record_tool_call_trace(&update.session_id, &update.provider, tool_call, cwd).await;
        } else {
            // Input is deferred, store in pending
            self.pending_tool_calls.insert(tool_call.tool_call_id.clone(), PendingToolCall {
                tool_call_id: tool_call.tool_call_id.clone(),
                name: tool_call.name.clone(),
                title: tool_call.title.clone(),
                provider: update.provider.clone(),
                traced: false,
            });
        }
    }

    async fn handle_tool_call_update(&mut self, update: &NormalizedSessionUpdate, cwd: &str) {
        let Some(tool_call) = &update.tool_call else { return };

        // Check if this update provides deferred input - extract data first to avoid borrow issues
        let should_trace_call = {
            if let Some(pending) = self.pending_tool_calls.get(&tool_call.tool_call_id) {
                !pending.traced && tool_call.input_finalized && tool_call.input.is_some()
            } else {
                false
            }
        };

        let final_call_data = if should_trace_call {
            let pending = self.pending_tool_calls.get(&tool_call.tool_call_id).unwrap();
            Some(NormalizedToolCall {
                tool_call_id: tool_call.tool_call_id.clone(),
                name: if tool_call.name.is_empty() { pending.name.clone() } else { tool_call.name.clone() },
                title: tool_call.title.clone().or_else(|| pending.title.clone()),
                status: ToolStatus::Running,
                input: tool_call.input.clone(),
                output: None,
                input_finalized: true,
            })
        } else {
            None
        };

        // Now we can safely call async methods and mutate
        if let Some(final_call) = final_call_data {
            self.record_tool_call_trace(&update.session_id, &update.provider, &final_call, cwd).await;
            if let Some(pending) = self.pending_tool_calls.get_mut(&tool_call.tool_call_id) {
                pending.traced = true;
            }
        }

        // Record tool_result if complete
        if matches!(tool_call.status, ToolStatus::Completed | ToolStatus::Failed) {
            self.record_tool_result_trace(&update.session_id, &update.provider, tool_call, cwd).await;
            self.pending_tool_calls.remove(&tool_call.tool_call_id);
        }
    }

    async fn handle_agent_message(&mut self, update: &NormalizedSessionUpdate, cwd: &str) {
        let Some(message) = &update.message else { return };

        if message.is_chunk {
            let existing = self.message_buffer.entry(update.session_id.clone()).or_default();
            existing.push_str(&message.content);

            if existing.len() >= 100 {
                let content = std::mem::take(existing);
                self.record_agent_message_trace(&update.session_id, &update.provider, &content, cwd).await;
            }
        } else {
            self.record_agent_message_trace(&update.session_id, &update.provider, &message.content, cwd).await;
        }
    }

    async fn handle_agent_thought(&mut self, update: &NormalizedSessionUpdate, cwd: &str) {
        let Some(message) = &update.message else { return };

        if message.is_chunk {
            let existing = self.thought_buffer.entry(update.session_id.clone()).or_default();
            existing.push_str(&message.content);

            if existing.len() >= 100 {
                let content = std::mem::take(existing);
                self.record_agent_thought_trace(&update.session_id, &update.provider, &content, cwd).await;
            }
        } else {
            self.record_agent_thought_trace(&update.session_id, &update.provider, &message.content, cwd).await;
        }
    }

    async fn handle_user_message(&mut self, update: &NormalizedSessionUpdate, cwd: &str) {
        let Some(message) = &update.message else { return };
        
        let record = TraceRecord::new(
            &update.session_id,
            TraceEventType::UserMessage,
            Contributor::new(&update.provider, None),
        ).with_conversation(TraceConversation {
            turn: None,
            role: Some("user".to_string()),
            content_preview: Some(message.content.chars().take(200).collect()),
            full_content: Some(message.content.clone()),
        });
        let writer = TraceWriter::new(cwd);
        let _ = writer.append_safe(&record).await;
    }

    async fn flush_buffers(&mut self, session_id: &str, cwd: &str, provider: &str) {
        // Flush message buffer
        if let Some(content) = self.message_buffer.remove(session_id) {
            if !content.is_empty() {
                self.record_agent_message_trace(session_id, provider, &content, cwd).await;
            }
        }

        // Flush thought buffer
        if let Some(content) = self.thought_buffer.remove(session_id) {
            if !content.is_empty() {
                self.record_agent_thought_trace(session_id, provider, &content, cwd).await;
            }
        }
    }

    async fn record_tool_call_trace(
        &self,
        session_id: &str,
        provider: &str,
        tool_call: &NormalizedToolCall,
        cwd: &str,
    ) {
        let record = TraceRecord::new(
            session_id,
            TraceEventType::ToolCall,
            Contributor::new(provider, None),
        ).with_tool(TraceTool {
            name: tool_call.name.clone(),
            tool_call_id: Some(tool_call.tool_call_id.clone()),
            status: Some("running".to_string()),
            input: tool_call.input.clone(),
            output: None,
        });
        let writer = TraceWriter::new(cwd);
        let _ = writer.append_safe(&record).await;
    }

    async fn record_tool_result_trace(
        &self,
        session_id: &str,
        provider: &str,
        tool_call: &NormalizedToolCall,
        cwd: &str,
    ) {
        let record = TraceRecord::new(
            session_id,
            TraceEventType::ToolResult,
            Contributor::new(provider, None),
        ).with_tool(TraceTool {
            name: tool_call.name.clone(),
            tool_call_id: Some(tool_call.tool_call_id.clone()),
            status: Some(tool_call.status.as_str().to_string()),
            input: None,
            output: tool_call.output.clone(),
        });
        let writer = TraceWriter::new(cwd);
        let _ = writer.append_safe(&record).await;
    }

    async fn record_agent_message_trace(
        &self,
        session_id: &str,
        provider: &str,
        content: &str,
        cwd: &str,
    ) {
        let record = TraceRecord::new(
            session_id,
            TraceEventType::AgentMessage,
            Contributor::new(provider, None),
        ).with_conversation(TraceConversation {
            turn: None,
            role: Some("assistant".to_string()),
            content_preview: Some(content.chars().take(200).collect()),
            full_content: Some(content.to_string()),
        });
        let writer = TraceWriter::new(cwd);
        let _ = writer.append_safe(&record).await;
    }

    async fn record_agent_thought_trace(
        &self,
        session_id: &str,
        provider: &str,
        content: &str,
        cwd: &str,
    ) {
        let record = TraceRecord::new(
            session_id,
            TraceEventType::AgentThought,
            Contributor::new(provider, None),
        ).with_conversation(TraceConversation {
            turn: None,
            role: Some("assistant".to_string()),
            content_preview: Some(content.chars().take(200).collect()),
            full_content: Some(content.to_string()),
        });
        let writer = TraceWriter::new(cwd);
        let _ = writer.append_safe(&record).await;
    }

    /// Flush buffers for a session (call when prompt completes).
    pub async fn flush_session(&mut self, session_id: &str, cwd: &str, provider: &str) {
        self.flush_buffers(session_id, cwd, provider).await;
    }

    /// Clean up session data when session ends.
    pub fn cleanup_session(&mut self, session_id: &str) {
        self.message_buffer.remove(session_id);
        self.thought_buffer.remove(session_id);
        self.pending_tool_calls.retain(|_, v| v.tool_call_id != session_id);
    }
}

impl Default for TraceRecorder {
    fn default() -> Self {
        Self::new()
    }
}

