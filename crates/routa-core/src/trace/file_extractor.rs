//! File range extractor for Agent Trace.
//!
//! Extracts file paths and line ranges from tool call parameters
//! to populate TraceFile and TraceRange in trace records.

use serde_json::Value;
use super::types::{TraceFile, TraceRange};

/// File editing tools that we track for ranges.
const FILE_EDIT_TOOLS: &[&str] = &[
    "Read",
    "Write",
    "Edit",
    "MultiEdit",
    "NotebookRead",
    "NotebookEdit",
];

/// Extract file information from tool call parameters.
/// Returns a vector of TraceFile objects with ranges if applicable.
pub fn extract_files_from_tool_call(
    tool_name: &str,
    params: &Value,
) -> Vec<TraceFile> {
    // Normalize tool name (strip MCP prefix)
    let base_tool_name = normalize_tool_name(tool_name);

    if !FILE_EDIT_TOOLS.contains(&base_tool_name.as_str()) {
        return Vec::new();
    }

    let mut files = Vec::new();

    match base_tool_name.as_str() {
        "Read" | "Write" => {
            if let Some(file_path) = extract_file_path(params) {
                files.push(TraceFile {
                    path: file_path,
                    ranges: Vec::new(),
                    operation: Some(if base_tool_name == "Read" { "read" } else { "write" }.to_string()),
                    content_hash: None,
                });
            }
        }
        "Edit" => {
            if let Some(file_path) = extract_file_path(params) {
                let ranges = extract_ranges_from_edit(params);
                files.push(TraceFile {
                    path: file_path,
                    ranges: ranges.unwrap_or_default(),
                    operation: Some("edit".to_string()),
                    content_hash: None,
                });
            }
        }
        "MultiEdit" => {
            // MultiEdit has multiple edits on possibly different files
            if let Some(edits) = params.get("edits").and_then(|v| v.as_array()) {
                for edit in edits {
                    if let Some(edit_path) = extract_file_path(edit) {
                        let ranges = extract_ranges_from_edit(edit);
                        files.push(TraceFile {
                            path: edit_path,
                            ranges: ranges.unwrap_or_default(),
                            operation: Some("edit".to_string()),
                            content_hash: None,
                        });
                    }
                }
            }
        }
        "NotebookRead" | "NotebookEdit" => {
            if let Some(file_path) = extract_file_path(params) {
                files.push(TraceFile {
                    path: file_path,
                    ranges: Vec::new(),
                    operation: Some(if base_tool_name == "NotebookRead" { "read" } else { "edit" }.to_string()),
                    content_hash: None,
                });
            }
        }
        _ => {}
    }

    files
}

/// Extract file path from tool parameters.
/// Checks for both `file_path` and `path` fields.
fn extract_file_path(params: &Value) -> Option<String> {
    params.get("file_path")
        .or_else(|| params.get("path"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Extract line ranges from Edit tool parameters.
fn extract_ranges_from_edit(params: &Value) -> Option<Vec<TraceRange>> {
    let mut ranges = Vec::new();

    // Check for explicit line range
    if let (Some(start), Some(end)) = (
        params.get("startLine").and_then(|v| v.as_u64()),
        params.get("endLine").and_then(|v| v.as_u64())
    ) {
        ranges.push(TraceRange {
            start_line: start as u32,
            end_line: end as u32,
            start_column: None,
            end_column: None,
        });
    }

    // Check for oldStr/newStr with line numbers
    if let (Some(old), Some(new)) = (
        params.get("oldLine").and_then(|v| v.as_u64()),
        params.get("newLine").and_then(|v| v.as_u64())
    ) {
        ranges.push(TraceRange {
            start_line: old as u32,
            end_line: new as u32,
            start_column: None,
            end_column: None,
        });
    }

    if ranges.is_empty() {
        None
    } else {
        Some(ranges)
    }
}

/// Normalize tool name by stripping MCP prefix.
/// mcp__server-name__tool_name -> tool_name
fn normalize_tool_name(tool_name: &str) -> String {
    if let Some(rest) = tool_name.strip_prefix("mcp__") {
        // Find the last __ separator to get the actual tool name
        if let Some(pos) = rest.rfind("__") {
            rest[pos + 2..].to_string()
        } else {
            tool_name.to_string()
        }
    } else {
        tool_name.to_string()
    }
}

/// Compute content hash for a file (for attribution).
/// Uses a simple hash of the file path and content.
pub fn compute_content_hash(file_path: &str, content: Option<&str>) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    let mut hasher = DefaultHasher::new();

    file_path.hash(&mut hasher);

    if let Some(content) = content {
        content.hash(&mut hasher);
    }

    format!("{:x}", hasher.finish())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_extract_read_tool() {
        let params = json!({
            "file_path": "/path/to/file.ts",
            "offset": 1,
            "limit": 100
        });

        let files = extract_files_from_tool_call("Read", &params);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "/path/to/file.ts");
        assert_eq!(files[0].operation, Some("read".to_string()));
    }

    #[test]
    fn test_extract_edit_tool_with_ranges() {
        let params = json!({
            "file_path": "/path/to/file.ts",
            "startLine": 10,
            "endLine": 20,
            "oldStr": "old",
            "newStr": "new"
        });

        let files = extract_files_from_tool_call("Edit", &params);
        assert_eq!(files.len(), 1);
        assert_eq!(files[0].path, "/path/to/file.ts");
        assert_eq!(files[0].ranges.len(), 1);
        assert_eq!(files[0].ranges[0].start_line, 10);
        assert_eq!(files[0].ranges[0].end_line, 20);
    }

    #[test]
    fn test_normalize_tool_name() {
        assert_eq!(normalize_tool_name("Read"), "Read");
        assert_eq!(normalize_tool_name("mcp__server__Read"), "Read");
        assert_eq!(normalize_tool_name("mcp__my-server__my_tool"), "my_tool");
    }

    #[test]
    fn test_content_hash() {
        let hash1 = compute_content_hash("test.ts", Some("content"));
        let hash2 = compute_content_hash("test.ts", Some("content"));
        let hash3 = compute_content_hash("test.ts", Some("different"));

        assert_eq!(hash1, hash2);
        assert_ne!(hash1, hash3);
    }
}
