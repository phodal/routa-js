//! `routa security` — local rule-based security scanning.

use routa_core::security::{scan_directory, SecurityRuleSet};
use std::path::Path;

pub async fn scan(path: &str, format: &str, fail_on_error: bool) -> Result<(), String> {
    let rule_set = SecurityRuleSet::default_rules();
    let summary = scan_directory(Path::new(path), &rule_set)?;

    match format {
        "json" => {
            let out = serde_json::to_string_pretty(&summary)
                .map_err(|error| format!("Failed to serialize summary as JSON: {error}"))?;
            println!("{out}");
        }
        _ => {
            println!("🔎 Security scan finished");
            println!("   Path: {path}");
            println!("   Files scanned: {}", summary.files_scanned);
            println!("   Errors: {}", summary.error_count());
            println!("   Warnings: {}", summary.warning_count());

            if !summary.findings.is_empty() {
                println!();
                for finding in &summary.findings {
                    println!(
                        "- [{:?}] {}:{} {} ({})",
                        finding.severity,
                        finding.file,
                        finding.line,
                        finding.message,
                        finding.rule_id
                    );
                }
            }
        }
    }

    if fail_on_error && summary.error_count() > 0 {
        return Err(format!(
            "Security scan found {} error finding(s)",
            summary.error_count()
        ));
    }

    Ok(())
}
