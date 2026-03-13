use std::fs;
use std::path::PathBuf;

use anyhow::Context;
use clap::Parser;
use routa_security_scan::{default_tools, run_scan, to_markdown, ScanReport};

#[derive(Debug, Parser)]
#[command(author, version, about = "Routa security scanning orchestrator")]
struct Cli {
    /// Directory to scan
    #[arg(long, default_value = ".")]
    target: PathBuf,

    /// Output JSON report path
    #[arg(long, default_value = "reports/security-scan.json")]
    json_out: PathBuf,

    /// Output markdown report path
    #[arg(long, default_value = "reports/security-scan.md")]
    md_out: PathBuf,
}

fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    let mut results = Vec::new();
    for tool in default_tools() {
        println!("Running scan: {}", tool.name);
        results.push(run_scan(&tool, &cli.target));
    }

    let report = ScanReport {
        target_dir: cli.target.display().to_string(),
        generated_at: chrono::Utc::now().to_rfc3339(),
        results,
    };

    if let Some(parent) = cli.json_out.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create report directory {}", parent.display()))?;
    }
    if let Some(parent) = cli.md_out.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("create report directory {}", parent.display()))?;
    }

    let report_json = serde_json::to_vec_pretty(&report).context("serialize json report")?;
    fs::write(&cli.json_out, report_json)
        .with_context(|| format!("write json report {}", cli.json_out.display()))?;

    let markdown = to_markdown(&report);
    fs::write(&cli.md_out, markdown)
        .with_context(|| format!("write markdown report {}", cli.md_out.display()))?;

    println!("Security scan report written to {}", cli.json_out.display());
    println!("Security scan summary written to {}", cli.md_out.display());

    Ok(())
}
