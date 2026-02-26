//! Provider Adapter Module
//!
//! Normalizes messages from different ACP providers (Claude Code, OpenCode, Kimi, etc.)
//! to a unified internal format for consistent trace recording.

mod types;
mod trace_recorder;

pub use types::*;
pub use trace_recorder::TraceRecorder;

/// Get the appropriate adapter behavior for a provider.
pub fn get_provider_behavior(provider: &str) -> ProviderBehavior {
    match provider.to_lowercase().as_str() {
        "claude" | "claude-code" | "claudecode" | "claude-code-sdk" => ProviderBehavior {
            provider_type: ProviderType::Claude,
            immediate_tool_input: true,  // Claude sends input with tool_call
            streaming: true,
        },
        "opencode" | "open-code" | "opencode-sdk" => ProviderBehavior {
            provider_type: ProviderType::OpenCode,
            immediate_tool_input: false, // OpenCode sends input in updates
            streaming: true,
        },
        "kimi" => ProviderBehavior {
            provider_type: ProviderType::Kimi,
            immediate_tool_input: false, // Handle both patterns
            streaming: true,
        },
        "gemini" => ProviderBehavior {
            provider_type: ProviderType::Gemini,
            immediate_tool_input: false,
            streaming: true,
        },
        _ => ProviderBehavior {
            provider_type: ProviderType::Standard,
            immediate_tool_input: false, // Safe default: handle deferred input
            streaming: true,
        },
    }
}

