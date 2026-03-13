use crate::security::report::SecuritySeverity;
use regex::Regex;

/// Single rule with one or more regex signatures.
#[derive(Debug, Clone)]
pub struct SecurityRule {
    pub id: &'static str,
    pub message: &'static str,
    pub severity: SecuritySeverity,
    pub patterns: Vec<Regex>,
}

/// Reusable security rule set.
#[derive(Debug, Clone)]
pub struct SecurityRuleSet {
    rules: Vec<SecurityRule>,
}

impl SecurityRuleSet {
    pub fn default_rules() -> Self {
        let rules = vec![
            SecurityRule {
                id: "unauthenticated-api-endpoint",
                message: "Potential unauthenticated API route",
                severity: SecuritySeverity::Error,
                patterns: vec![Regex::new(r"(?i)app\.get\([^)]*req\s*,\s*res\s*\)").unwrap()],
            },
            SecurityRule {
                id: "shell-injection-via-exec",
                message: "Potential command injection: avoid interpolation in exec",
                severity: SecuritySeverity::Error,
                patterns: vec![
                    Regex::new(r"child_process\.exec\(([^\)]*\+[^\)]*)\)").unwrap(),
                    Regex::new(r"exec\(`[^`]*\$\{[^`]+\}[^`]*`\)").unwrap(),
                ],
            },
            SecurityRule {
                id: "xss-dangerous-inner-html",
                message: "dangerouslySetInnerHTML should sanitize input",
                severity: SecuritySeverity::Warning,
                patterns: vec![Regex::new(r"dangerouslySetInnerHTML\s*=\s*\{\{\s*__html").unwrap()],
            },
            SecurityRule {
                id: "ssrf-unvalidated-fetch",
                message: "fetch URL should be validated / allowlisted",
                severity: SecuritySeverity::Warning,
                patterns: vec![Regex::new(r"fetch\((req\.|params\.|query\.|body\.)").unwrap()],
            },
            SecurityRule {
                id: "dangerous-permission-bypass",
                message: "Permission bypass flags must be disabled by default",
                severity: SecuritySeverity::Error,
                patterns: vec![
                    Regex::new(r"bypassPermissions").unwrap(),
                    Regex::new(r"dangerously-skip-permissions").unwrap(),
                    Regex::new(r"allowDangerouslySkipPermissions\s*:\s*true").unwrap(),
                    Regex::new(r"allow-all-tools").unwrap(),
                ],
            },
            SecurityRule {
                id: "docker-port-all-interfaces",
                message: "Bind docker ports to 127.0.0.1 instead of all interfaces",
                severity: SecuritySeverity::Warning,
                patterns: vec![Regex::new(r"-p\s+\d+:\d+").unwrap()],
            },
        ];

        Self { rules }
    }

    pub fn all(&self) -> &[SecurityRule] {
        &self.rules
    }
}
