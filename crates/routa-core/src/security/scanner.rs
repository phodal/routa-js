use crate::security::report::{SecurityFinding, SecuritySummary};
use crate::security::rules::SecurityRuleSet;
use std::fs;
use std::path::{Path, PathBuf};

const DEFAULT_EXTENSIONS: &[&str] = &[
    "js",
    "jsx",
    "ts",
    "tsx",
    "rs",
    "py",
    "go",
    "java",
    "kt",
    "yml",
    "yaml",
    "sh",
    "dockerfile",
];

pub fn scan_text(file: &str, content: &str, rule_set: &SecurityRuleSet) -> Vec<SecurityFinding> {
    let mut findings = Vec::new();

    for (index, line) in content.lines().enumerate() {
        for rule in rule_set.all() {
            if rule.patterns.iter().any(|pattern| pattern.is_match(line)) {
                findings.push(SecurityFinding {
                    rule_id: rule.id.to_string(),
                    message: rule.message.to_string(),
                    severity: rule.severity,
                    file: file.to_string(),
                    line: index + 1,
                    snippet: line.trim().to_string(),
                });
            }
        }
    }

    findings
}

pub fn scan_directory(root: &Path, rule_set: &SecurityRuleSet) -> Result<SecuritySummary, String> {
    let mut files = Vec::new();
    collect_files(root, &mut files)?;

    let mut findings = Vec::new();
    let mut scanned_count = 0usize;

    for file in files {
        let Some(display_path) = file.to_str() else {
            continue;
        };
        let Ok(content) = fs::read_to_string(&file) else {
            continue;
        };
        scanned_count += 1;
        findings.extend(scan_text(display_path, &content, rule_set));
    }

    Ok(SecuritySummary {
        files_scanned: scanned_count,
        findings,
    })
}

fn collect_files(root: &Path, acc: &mut Vec<PathBuf>) -> Result<(), String> {
    let entries = fs::read_dir(root)
        .map_err(|error| format!("Failed to read directory '{}': {}", root.display(), error))?;

    for entry in entries {
        let entry = entry.map_err(|error| format!("Failed to read directory entry: {error}"))?;
        let path = entry.path();

        if path.is_dir() {
            let name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if name == "node_modules" || name == "target" || name == ".git" {
                continue;
            }
            collect_files(&path, acc)?;
            continue;
        }

        if should_scan(&path) {
            acc.push(path);
        }
    }

    Ok(())
}

fn should_scan(path: &Path) -> bool {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();

    if file_name == "dockerfile" {
        return true;
    }

    path.extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| {
            DEFAULT_EXTENSIONS
                .iter()
                .any(|candidate| ext.eq_ignore_ascii_case(candidate))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_find_permission_bypass() {
        let rules = SecurityRuleSet::default_rules();
        let findings = scan_text(
            "demo.ts",
            "const mode = { allowDangerouslySkipPermissions: true };",
            &rules,
        );

        assert!(findings
            .iter()
            .any(|f| f.rule_id == "dangerous-permission-bypass"));
    }
}
