//! Security scanning primitives.

pub mod report;
pub mod rules;
pub mod scanner;

pub use report::{SecurityFinding, SecuritySeverity, SecuritySummary};
pub use rules::SecurityRuleSet;
pub use scanner::{scan_directory, scan_text};
