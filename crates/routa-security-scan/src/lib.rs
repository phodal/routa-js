use std::path::Path;
use std::process::Command;
use std::time::Instant;

use serde::Serialize;

#[derive(Debug, Clone)]
pub struct ScanTool {
    pub name: &'static str,
    pub description: &'static str,
    pub command: &'static str,
    pub args: &'static [&'static str],
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum ScanStatus {
    Passed,
    Failed,
    Skipped,
}

#[derive(Debug, Serialize)]
pub struct ScanResult {
    pub name: String,
    pub description: String,
    pub command: String,
    pub status: ScanStatus,
    pub exit_code: Option<i32>,
    pub duration_ms: u128,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize)]
pub struct ScanReport {
    pub target_dir: String,
    pub generated_at: String,
    pub results: Vec<ScanResult>,
}

pub fn default_tools() -> Vec<ScanTool> {
    vec![
        ScanTool {
            name: "typescript-tsc",
            description: "TypeScript type-check scan",
            command: "npx",
            args: &["tsc", "--noEmit"],
        },
        ScanTool {
            name: "rust-clippy",
            description: "Rust lint and correctness scan",
            command: "cargo",
            args: &[
                "clippy",
                "--workspace",
                "--all-targets",
                "--",
                "-D",
                "warnings",
            ],
        },
        ScanTool {
            name: "docker-hadolint",
            description: "Dockerfile best-practice scan",
            command: "hadolint",
            args: &["Dockerfile"],
        },
        ScanTool {
            name: "npm-audit",
            description: "Node dependency vulnerability scan",
            command: "npm",
            args: &["audit", "--audit-level=high", "--json"],
        },
        ScanTool {
            name: "cargo-audit",
            description: "Rust dependency vulnerability scan",
            command: "cargo",
            args: &["audit", "--json"],
        },
    ]
}

pub fn run_scan(tool: &ScanTool, target_dir: &Path) -> ScanResult {
    let started = Instant::now();
    let mut command = Command::new(tool.command);
    command.args(tool.args).current_dir(target_dir);

    match command.output() {
        Ok(output) => {
            let duration_ms = started.elapsed().as_millis();
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let exit_code = output.status.code();
            let status = if output.status.success() {
                ScanStatus::Passed
            } else if is_command_missing(&stderr, exit_code) {
                ScanStatus::Skipped
            } else {
                ScanStatus::Failed
            };

            ScanResult {
                name: tool.name.to_string(),
                description: tool.description.to_string(),
                command: format!("{} {}", tool.command, tool.args.join(" ")),
                status,
                exit_code,
                duration_ms,
                stdout,
                stderr,
            }
        }
        Err(err) => ScanResult {
            name: tool.name.to_string(),
            description: tool.description.to_string(),
            command: format!("{} {}", tool.command, tool.args.join(" ")),
            status: ScanStatus::Skipped,
            exit_code: None,
            duration_ms: started.elapsed().as_millis(),
            stdout: String::new(),
            stderr: format!("failed to execute command: {err}"),
        },
    }
}

pub fn to_markdown(report: &ScanReport) -> String {
    let mut content = String::new();
    content.push_str("# Security Scan Report\n\n");
    content.push_str(&format!("- Target: `{}`\n", report.target_dir));
    content.push_str(&format!("- Generated at: `{}`\n\n", report.generated_at));
    content.push_str("| Tool | Status | Duration (ms) | Exit code |\n");
    content.push_str("| --- | --- | ---: | ---: |\n");

    for result in &report.results {
        let status = match result.status {
            ScanStatus::Passed => "✅ passed",
            ScanStatus::Failed => "❌ failed",
            ScanStatus::Skipped => "⚠️ skipped",
        };
        let code = result
            .exit_code
            .map_or_else(|| "n/a".to_string(), |c| c.to_string());
        content.push_str(&format!(
            "| `{}` | {} | {} | {} |\n",
            result.name, status, result.duration_ms, code
        ));
    }

    content.push('\n');
    for result in &report.results {
        if matches!(result.status, ScanStatus::Failed | ScanStatus::Skipped) {
            content.push_str(&format!("## {}\n\n", result.name));
            content.push_str(&format!("- Command: `{}`\n", result.command));
            content.push_str(&format!("- Reason:\n\n```text\n{}\n```\n\n", result.stderr));
        }
    }

    content
}

fn is_command_missing(stderr: &str, exit_code: Option<i32>) -> bool {
    matches!(exit_code, Some(127))
        || stderr.contains("command not found")
        || stderr.contains("No such file or directory")
        || stderr.contains("could not find")
}
