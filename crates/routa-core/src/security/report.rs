use serde::{Deserialize, Serialize};

/// Finding severity for security scans.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, PartialOrd, Ord)]
#[serde(rename_all = "UPPERCASE")]
pub enum SecuritySeverity {
    Warning,
    Error,
}

/// A single security finding emitted by a rule.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecurityFinding {
    pub rule_id: String,
    pub message: String,
    pub severity: SecuritySeverity,
    pub file: String,
    pub line: usize,
    pub snippet: String,
}

/// Aggregate summary for a scan run.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SecuritySummary {
    pub files_scanned: usize,
    pub findings: Vec<SecurityFinding>,
}

impl SecuritySummary {
    pub fn warning_count(&self) -> usize {
        self.findings
            .iter()
            .filter(|finding| finding.severity == SecuritySeverity::Warning)
            .count()
    }

    pub fn error_count(&self) -> usize {
        self.findings
            .iter()
            .filter(|finding| finding.severity == SecuritySeverity::Error)
            .count()
    }
}
