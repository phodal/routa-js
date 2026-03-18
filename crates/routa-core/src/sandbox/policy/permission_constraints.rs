use std::collections::BTreeSet;

use serde::{Deserialize, Serialize};

use super::{
    ResolvedSandboxPolicy, SandboxCapability, SandboxLinkedWorktreeMode, SandboxNetworkMode,
    SandboxPolicyInput,
};

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SandboxPermissionConstraints {
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read_only_paths: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub read_write_paths: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub env_file: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub env_allowlist: Vec<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub capabilities: Vec<SandboxCapability>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub network_mode: Option<SandboxNetworkMode>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub linked_worktree_mode: Option<SandboxLinkedWorktreeMode>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub linked_worktree_ids: Vec<String>,
}

impl SandboxPermissionConstraints {
    pub fn is_empty(&self) -> bool {
        self.read_only_paths.is_empty()
            && self.read_write_paths.is_empty()
            && self.env_file.is_none()
            && self.env_allowlist.is_empty()
            && self.capabilities.is_empty()
            && self.network_mode.is_none()
            && self.linked_worktree_mode.is_none()
            && self.linked_worktree_ids.is_empty()
    }

    pub fn normalize_capabilities(&self) -> Vec<SandboxCapability> {
        let mut capabilities = self.capabilities.iter().copied().collect::<BTreeSet<_>>();
        if !self.read_write_paths.is_empty() {
            capabilities.insert(SandboxCapability::WorkspaceWrite);
        }
        if matches!(self.network_mode, Some(SandboxNetworkMode::Bridge)) {
            capabilities.insert(SandboxCapability::NetworkAccess);
        }
        if self.linked_worktree_mode.is_some() || !self.linked_worktree_ids.is_empty() {
            capabilities.insert(SandboxCapability::LinkedWorktreeRead);
        }

        capabilities.into_iter().collect()
    }
}

impl SandboxPolicyInput {
    pub fn apply_permission_constraints(
        &self,
        constraints: &SandboxPermissionConstraints,
    ) -> SandboxPolicyInput {
        let mut policy = self.clone();
        policy.read_only_paths =
            merge_string_lists(&policy.read_only_paths, &constraints.read_only_paths);
        policy.read_write_paths =
            merge_string_lists(&policy.read_write_paths, &constraints.read_write_paths);
        if constraints.env_file.is_some() {
            policy.env_file = constraints.env_file.clone();
        }
        policy.env_allowlist =
            merge_string_lists(&policy.env_allowlist, &constraints.env_allowlist);
        policy.capabilities =
            merge_capabilities(&policy.capabilities, &constraints.normalize_capabilities());
        if constraints.network_mode.is_some() {
            policy.network_mode = constraints.network_mode;
        }
        if constraints.linked_worktree_mode.is_some() {
            policy.linked_worktree_mode = constraints.linked_worktree_mode;
        }
        policy.linked_worktree_ids = merge_string_lists(
            &policy.linked_worktree_ids,
            &constraints.linked_worktree_ids,
        );
        policy
    }
}

impl ResolvedSandboxPolicy {
    pub fn to_input(&self) -> SandboxPolicyInput {
        SandboxPolicyInput {
            workspace_id: self.workspace_id.clone(),
            codebase_id: self.codebase_id.clone(),
            workdir: Some(self.host_workdir.clone()),
            read_only_paths: self.read_only_paths.clone(),
            read_write_paths: self.read_write_paths.clone(),
            network_mode: Some(self.network_mode),
            env_mode: Some(self.env_mode),
            env_file: self
                .env_files
                .iter()
                .find(|env_file| env_file.source == super::SandboxEnvFileSource::Request)
                .map(|env_file| env_file.path.clone()),
            env_allowlist: self.env_allowlist.clone(),
            capabilities: self
                .capabilities
                .iter()
                .filter(|capability| capability.enabled)
                .filter(|capability| capability.capability != SandboxCapability::WorkspaceRead)
                .map(|capability| capability.capability)
                .collect(),
            linked_worktree_mode: if self.linked_worktrees.is_empty() {
                None
            } else {
                Some(SandboxLinkedWorktreeMode::Explicit)
            },
            linked_worktree_ids: self
                .linked_worktrees
                .iter()
                .map(|worktree| worktree.id.clone())
                .collect(),
            trust_workspace_config: self
                .workspace_config
                .as_ref()
                .map(|config| config.trusted)
                .unwrap_or(false),
        }
    }
}

fn merge_string_lists(base: &[String], overlay: &[String]) -> Vec<String> {
    base.iter()
        .chain(overlay.iter())
        .map(|value| value.trim())
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn merge_capabilities(
    base: &[SandboxCapability],
    overlay: &[SandboxCapability],
) -> Vec<SandboxCapability> {
    base.iter()
        .chain(overlay.iter())
        .copied()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sandbox::{
        ResolvedSandboxCapability, ResolvedSandboxEnvFile, SandboxCapabilityTier,
        SandboxEnvFileSource, SandboxEnvMode, SandboxMount, SandboxNetworkMode,
    };

    #[test]
    fn permission_constraints_normalize_capabilities_from_requested_access() {
        let constraints = SandboxPermissionConstraints {
            read_write_paths: vec!["src".to_string()],
            network_mode: Some(SandboxNetworkMode::Bridge),
            linked_worktree_mode: Some(SandboxLinkedWorktreeMode::All),
            ..Default::default()
        };

        let caps = constraints.normalize_capabilities();
        assert!(caps.contains(&SandboxCapability::WorkspaceWrite));
        assert!(caps.contains(&SandboxCapability::NetworkAccess));
        assert!(caps.contains(&SandboxCapability::LinkedWorktreeRead));
    }

    #[test]
    fn apply_permission_constraints_merges_into_policy_input() {
        let base = SandboxPolicyInput {
            read_only_paths: vec!["docs".to_string()],
            capabilities: vec![SandboxCapability::WorkspaceWrite],
            ..Default::default()
        };
        let constraints = SandboxPermissionConstraints {
            read_write_paths: vec!["src".to_string()],
            env_file: Some(".env.permission".to_string()),
            env_allowlist: vec!["OPENAI_API_KEY".to_string()],
            linked_worktree_ids: vec!["wt-1".to_string()],
            ..Default::default()
        };

        let mutated = base.apply_permission_constraints(&constraints);
        assert!(mutated.read_only_paths.contains(&"docs".to_string()));
        assert!(mutated.read_write_paths.contains(&"src".to_string()));
        assert_eq!(mutated.env_file.as_deref(), Some(".env.permission"));
        assert!(mutated
            .capabilities
            .contains(&SandboxCapability::LinkedWorktreeRead));
    }

    #[test]
    fn resolved_policy_round_trips_to_mutable_input() {
        let policy = ResolvedSandboxPolicy {
            workspace_id: Some("ws-1".to_string()),
            codebase_id: Some("cb-1".to_string()),
            scope_root: "/repo".to_string(),
            host_workdir: "/repo".to_string(),
            container_workdir: "/workspace".to_string(),
            read_only_paths: vec!["/repo/docs".to_string()],
            read_write_paths: vec!["/repo/src".to_string()],
            network_mode: SandboxNetworkMode::None,
            env_mode: SandboxEnvMode::Sanitized,
            env_files: vec![ResolvedSandboxEnvFile {
                path: "/repo/.env.permission".to_string(),
                source: SandboxEnvFileSource::Request,
                keys: vec!["OPENAI_API_KEY".to_string()],
            }],
            env_allowlist: vec!["OPENAI_API_KEY".to_string()],
            mounts: vec![SandboxMount {
                host_path: "/repo".to_string(),
                container_path: "/workspace".to_string(),
                access: super::super::SandboxMountAccess::ReadOnly,
                reason: Some("scopeRoot".to_string()),
            }],
            capabilities: vec![ResolvedSandboxCapability {
                capability: SandboxCapability::WorkspaceWrite,
                tier: SandboxCapabilityTier::Action,
                enabled: true,
                reason: "enabled".to_string(),
            }],
            linked_worktrees: vec![],
            workspace_config: None,
            notes: vec![],
        };

        let input = policy.to_input();
        assert_eq!(input.workspace_id.as_deref(), Some("ws-1"));
        assert_eq!(input.env_file.as_deref(), Some("/repo/.env.permission"));
        assert!(input
            .capabilities
            .contains(&SandboxCapability::WorkspaceWrite));
    }
}
