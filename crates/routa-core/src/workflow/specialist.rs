//! Specialist definition — load specialist prompts from YAML files.
//!
//! Specialists can be defined in YAML format (like the existing `.md` files
//! with frontmatter, but fully in YAML for the Rust workflow engine).
//!
//! ```yaml
//! name: "Implementor"
//! id: "crafter"
//! description: "Executes implementation tasks, writes code"
//! role: "CRAFTER"
//! model_tier: "smart"
//! role_reminder: "Stay within task scope."
//! system_prompt: |
//!   ## Crafter (Implementor)
//!   Implement your assigned task — nothing more, nothing less.
//!   ...
//! ```

use std::collections::HashMap;
use std::path::Path;

use serde::{Deserialize, Serialize};

/// A specialist agent definition loaded from YAML.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SpecialistDef {
    /// Specialist ID (e.g., "crafter", "gate", "routa")
    pub id: String,

    /// Display name
    pub name: String,

    /// Description of what this specialist does
    #[serde(default)]
    pub description: Option<String>,

    /// Agent role: ROUTA, CRAFTER, GATE, DEVELOPER
    #[serde(default = "default_role")]
    pub role: String,

    /// Model tier: fast, smart, reasoning
    #[serde(default = "default_model_tier")]
    pub model_tier: String,

    /// The system prompt for this specialist
    pub system_prompt: String,

    /// A brief reminder appended to messages
    #[serde(default)]
    pub role_reminder: Option<String>,

    /// Default adapter type to use with this specialist
    #[serde(default)]
    pub default_adapter: Option<String>,

    /// Default model to use
    #[serde(default)]
    pub default_model: Option<String>,

    /// Custom metadata
    #[serde(default)]
    pub metadata: HashMap<String, String>,
}

fn default_role() -> String {
    "DEVELOPER".to_string()
}

fn default_model_tier() -> String {
    "smart".to_string()
}

impl SpecialistDef {
    /// Parse a specialist definition from a YAML string.
    pub fn from_yaml(yaml: &str) -> Result<Self, String> {
        serde_yaml::from_str(yaml)
            .map_err(|e| format!("Failed to parse specialist YAML: {}", e))
    }

    /// Load a specialist definition from a YAML file.
    pub fn from_file(path: &str) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read specialist file '{}': {}", path, e))?;
        Self::from_yaml(&content)
    }

    /// Parse a specialist from an existing Markdown file with YAML frontmatter.
    /// (Compatibility with the `resources/specialists/*.md` format)
    pub fn from_markdown(path: &str) -> Result<Self, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read specialist markdown '{}': {}", path, e))?;

        // Parse YAML frontmatter between --- delimiters
        let parts: Vec<&str> = content.splitn(3, "---").collect();
        if parts.len() < 3 {
            return Err(format!(
                "Invalid specialist markdown '{}': missing YAML frontmatter",
                path
            ));
        }

        let frontmatter = parts[1].trim();
        let body = parts[2].trim();

        // Parse the frontmatter
        #[derive(Deserialize)]
        #[serde(rename_all = "camelCase")]
        struct FrontMatter {
            name: String,
            description: Option<String>,
            model_tier: Option<String>,
            role: Option<String>,
            role_reminder: Option<String>,
        }

        let fm: FrontMatter = serde_yaml::from_str(frontmatter)
            .map_err(|e| format!("Failed to parse frontmatter in '{}': {}", path, e))?;

        // Derive ID from filename
        let id = Path::new(path)
            .file_stem()
            .map(|s| s.to_string_lossy().to_string())
            .unwrap_or_else(|| "unknown".to_string());

        Ok(Self {
            id,
            name: fm.name,
            description: fm.description,
            role: fm.role.unwrap_or_else(|| "DEVELOPER".to_string()),
            model_tier: fm.model_tier.unwrap_or_else(|| "smart".to_string()),
            system_prompt: body.to_string(),
            role_reminder: fm.role_reminder,
            default_adapter: None,
            default_model: None,
            metadata: HashMap::new(),
        })
    }
}

/// Loads specialist definitions from a directory.
pub struct SpecialistLoader {
    /// Loaded specialists indexed by ID
    pub specialists: HashMap<String, SpecialistDef>,
}

impl SpecialistLoader {
    pub fn new() -> Self {
        Self {
            specialists: HashMap::new(),
        }
    }

    /// Load all specialists from a directory.
    /// Supports both `.yaml`/`.yml` and `.md` (markdown with frontmatter) files.
    pub fn load_dir(&mut self, dir: &str) -> Result<usize, String> {
        let dir_path = Path::new(dir);
        if !dir_path.is_dir() {
            return Err(format!("Specialist directory '{}' does not exist", dir));
        }

        let mut count = 0;
        for entry in std::fs::read_dir(dir_path)
            .map_err(|e| format!("Failed to read directory '{}': {}", dir, e))?
        {
            let entry = entry.map_err(|e| format!("Directory entry error: {}", e))?;
            let path = entry.path();
            let ext = path.extension().and_then(|e| e.to_str()).unwrap_or("");

            let specialist = match ext {
                "yaml" | "yml" => SpecialistDef::from_file(path.to_str().unwrap_or(""))?,
                "md" => SpecialistDef::from_markdown(path.to_str().unwrap_or(""))?,
                _ => continue,
            };

            tracing::info!("[SpecialistLoader] Loaded specialist: {} ({})", specialist.id, specialist.name);
            self.specialists.insert(specialist.id.clone(), specialist);
            count += 1;
        }

        Ok(count)
    }

    /// Get a specialist by ID.
    pub fn get(&self, id: &str) -> Option<&SpecialistDef> {
        self.specialists.get(id)
    }

    /// Get all loaded specialists.
    pub fn all(&self) -> &HashMap<String, SpecialistDef> {
        &self.specialists
    }

    /// Search directories for specialist files.
    /// Checks: `./specialists/`, `./resources/specialists/`, and custom paths.
    pub fn load_default_dirs(&mut self) -> usize {
        let mut total = 0;

        // Default search paths
        let search_paths = vec![
            "specialists",
            "resources/specialists",
            "../resources/specialists",
        ];

        for dir in &search_paths {
            if Path::new(dir).is_dir() {
                match self.load_dir(dir) {
                    Ok(n) => {
                        tracing::info!("[SpecialistLoader] Loaded {} specialists from '{}'", n, dir);
                        total += n;
                    }
                    Err(e) => {
                        tracing::warn!("[SpecialistLoader] Failed to load from '{}': {}", dir, e);
                    }
                }
            }
        }

        total
    }

    /// Get built-in fallback specialists (hardcoded, no files needed).
    pub fn builtin_specialists() -> Vec<SpecialistDef> {
        vec![
            SpecialistDef {
                id: "developer".to_string(),
                name: "Developer".to_string(),
                description: Some("Plans then implements itself".to_string()),
                role: "DEVELOPER".to_string(),
                model_tier: "smart".to_string(),
                system_prompt: "You are a skilled software developer. Plan first, then implement. \
                    Write clean, minimal code that satisfies the requirements.\n\
                    When done, summarize what you did.".to_string(),
                role_reminder: Some("Plan first, implement minimally, summarize when done.".to_string()),
                default_adapter: None,
                default_model: None,
                metadata: HashMap::new(),
            },
            SpecialistDef {
                id: "crafter".to_string(),
                name: "Implementor".to_string(),
                description: Some("Executes implementation tasks, writes code".to_string()),
                role: "CRAFTER".to_string(),
                model_tier: "fast".to_string(),
                system_prompt: "Implement the assigned task — nothing more, nothing less. \
                    Produce minimal, clean changes. Stay within scope.".to_string(),
                role_reminder: Some("Stay within task scope. No refactors, no scope creep.".to_string()),
                default_adapter: None,
                default_model: None,
                metadata: HashMap::new(),
            },
            SpecialistDef {
                id: "gate".to_string(),
                name: "Verifier".to_string(),
                description: Some("Reviews work and verifies completeness".to_string()),
                role: "GATE".to_string(),
                model_tier: "smart".to_string(),
                system_prompt: "You verify the implementation against acceptance criteria. \
                    Be evidence-driven: if you can't point to concrete evidence, it's not verified. \
                    No partial approvals.".to_string(),
                role_reminder: Some("Verify against acceptance criteria ONLY. Be evidence-driven.".to_string()),
                default_adapter: None,
                default_model: None,
                metadata: HashMap::new(),
            },
            SpecialistDef {
                id: "issue-refiner".to_string(),
                name: "Issue Refiner".to_string(),
                description: Some("Analyzes and refines requirements from issues".to_string()),
                role: "DEVELOPER".to_string(),
                model_tier: "smart".to_string(),
                system_prompt: "You analyze incoming issues and requirements. \
                    Break them down into clear, actionable tasks with acceptance criteria. \
                    Identify ambiguities and suggest clarifications.".to_string(),
                role_reminder: Some("Be specific about acceptance criteria and scope.".to_string()),
                default_adapter: None,
                default_model: None,
                metadata: HashMap::new(),
            },
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_specialist_yaml() {
        let yaml = r#"
id: "test-specialist"
name: "Test Specialist"
description: "A test specialist"
role: "DEVELOPER"
model_tier: "fast"
system_prompt: |
  You are a test specialist.
  Do test things.
role_reminder: "Stay on test."
"#;
        let spec = SpecialistDef::from_yaml(yaml).unwrap();
        assert_eq!(spec.id, "test-specialist");
        assert_eq!(spec.name, "Test Specialist");
        assert_eq!(spec.role, "DEVELOPER");
        assert!(spec.system_prompt.contains("test specialist"));
    }

    #[test]
    fn test_builtin_specialists() {
        let builtins = SpecialistLoader::builtin_specialists();
        assert!(builtins.len() >= 4);
        assert!(builtins.iter().any(|s| s.id == "developer"));
        assert!(builtins.iter().any(|s| s.id == "crafter"));
        assert!(builtins.iter().any(|s| s.id == "gate"));
        assert!(builtins.iter().any(|s| s.id == "issue-refiner"));
    }
}
