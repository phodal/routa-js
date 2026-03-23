---
title: "[GitHub #121] feat: Add ACP provider and specialist support to create_agent tool"
date: "2026-03-11"
status: resolved
severity: medium
area: "backend"
tags: ["github", "github-sync", "gh-121", "enhancement", "area-backend", "complexity-small"]
reported_by: "phodal"
related_issues: ["https://github.com/phodal/routa/issues/121"]
github_issue: 121
github_state: "closed"
github_url: "https://github.com/phodal/routa/issues/121"
---

# [GitHub #121] feat: Add ACP provider and specialist support to create_agent tool

## Sync Metadata

- Source: GitHub issue sync
- GitHub Issue: #121
- URL: https://github.com/phodal/routa/issues/121
- State: closed
- Author: phodal
- Created At: 2026-03-11T22:44:56Z
- Updated At: 2026-03-11T22:46:25Z

## Labels

- `enhancement`
- `area:backend`
- `complexity:small`

## Original GitHub Body

# Problem

The `create_agent` coordination tool currently only supports basic role-based agent creation. Users cannot specify which **ACP provider** to use (e.g., opencode, claude, gemini) or reference a **specialist ID** for custom agent configurations.

This limits flexibility in multi-agent workflows where:
- Different agents need to use different providers (e.g., use claude-opus for ROUTA coordinator, opencode for CRAFTER implementers)
- Custom specialists defined in the database or files cannot be referenced when creating agents

## Current Behavior

The `createAgent` function in `src/core/tools/agent-tools.ts` accepts:
```typescript
{
  name: string;
  role: string;  // Maps to AgentRole enum (ROUTA, CRAFTER, GATE, DEVELOPER)
  workspaceId: string;
  parentId?: string;
  modelTier?: string;  // FAST, BALANCED, SMART
  metadata?: Record<string, string>;
}
```

## Desired Behavior

Users should be able to optionally specify:
1. **ACP provider** - Which provider to use (e.g., "opencode", "claude", "claude-code-sdk", "gemini")
2. **Specialist ID** - Reference to a custom specialist configuration

## Relevant Files

- `src/core/tools/agent-tools.ts` - `createAgent` method (line 184-233)
- `src/core/models/agent.ts` - Agent model definition
- `src/core/acp/provider-registry.ts` - Provider registry and model resolution
- `src/core/acp/agent-instance-factory.ts` - AgentInstanceConfig supports `specialistId` and `provider`
- `src/core/orchestration/specialist-prompts.ts` - Specialist configuration loading
- `src/app/api/agents/route.ts` - REST API endpoint for agent creation

## Context: Existing Infrastructure

The codebase already has the necessary infrastructure:

1. **Provider Registry** (`src/core/acp/provider-registry.ts`):
   - Manages providers: opencode, claude, claude-code-sdk, gemini, copilot, etc.
   - Supports model tier resolution (fast/balanced/smart) per provider
   - `resolveModelForSpecialist()` function for provider-specialist compatibility

2. **Specialist System** (`src/core/orchestration/specialist-prompts.ts`):
   - Loads specialists from database, files, and hardcoded fallbacks
   - Each specialist has: id, name, role, systemPrompt, model, defaultModelTier
   - `getSpecialistById()` and `getSpecialistByRole()` lookup functions

3. **AgentInstanceFactory** (`src/core/acp/agent-instance-factory.ts`):
   - Already supports `specialistId` and `provider` in `AgentInstanceConfig`
   - `resolveConfig()` applies priority: explicit model → specialist.model → tier-based → env var

## Proposed Approaches

### Approach 1: Extend createAgent Parameters (Recommended)

**Changes:**
1. Add optional `provider` and `specialistId` parameters to `createAgent` in `agent-tools.ts`
2. Store these in agent metadata for persistence
3. Emit events with the new information

```typescript
async createAgent(params: {
  name: string;
  role: string;
  workspaceId: string;
  parentId?: string;
  modelTier?: string;
  specialistId?: string;  // NEW: Reference to specialist config
  provider?: string;       // NEW: ACP provider ID
  metadata?: Record<string, string>;
}): Promise<ToolResult>
```

**Pros:**
- Minimal changes - additive only
- Backward compatible (new parameters are optional)
- Metadata storage is simple and flexible
- No database schema changes required

**Cons:**
- Provider/specialist stored in metadata (less structured than dedicated fields)
- Validation happens later when agent is actually instantiated

**Estimated effort:** Small (2-3 hours)

---

### Approach 2: Add Dedicated Fields to Agent Model

**Changes:**
1. Add `providerId` and `specialistId` fields to Agent interface
2. Update database schema (sqlite + postgres)
3. Update all agent creation paths

```typescript
export interface Agent {
  // ... existing fields
  providerId?: string;    // NEW: ACP provider ID
  specialistId?: string;  // NEW: Specialist config ID
}
```

**Pros:**
- More structured - explicit fields are queryable
- Type-safe access to provider/specialist info
- Better for database queries (e.g., "find all agents using opencode")

**Cons:**
- Requires database migration
- More changes across the codebase
- Higher risk of breaking existing functionality

**Estimated effort:** Medium (4-6 hours)

---

### Approach 3: Hybrid - Metadata + Validation

**Changes:**
1. Store provider/specialist in metadata (Approach 1)
2. Add validation layer that checks provider/specialist exist
3. Return warnings if provider/specialist not found

```typescript
// In createAgent
if (params.provider) {
  const preset = getPresetById(params.provider);
  if (!preset) {
    console.warn(`[createAgent] Unknown provider: ${params.provider}`);
  }
}
if (params.specialistId) {
  const specialist = getSpecialistById(params.specialistId);
  if (!specialist) {
    console.warn(`[createAgent] Unknown specialist: ${params.specialistId}`);
  }
}
```

**Pros:**
- Fast to implement (no schema changes)
- Validates at creation time
- Good developer experience with warnings

**Cons:**
- Still less structured than dedicated fields
- Metadata requires parsing for queries

**Estimated effort:** Small (2-3 hours)

## Recommendation

**Start with Approach 1** (extend parameters) and implement Approach 3's validation.

This provides:
- ✅ Fast implementation (small effort)
- ✅ Backward compatibility
- ✅ Validation for better UX
- ✅ No database migrations needed

If querying by provider/specialist becomes a common pattern, consider Approach 2 as a follow-up enhancement.

## Implementation Details

### Files to modify:
1. `src/core/tools/agent-tools.ts` - Add parameters to `createAgent()`
2. `src/app/api/agents/route.ts` - Forward new parameters
3. `src/core/acp/routa-acp-agent.ts` - Update dispatchTool to handle new params

### Validation logic:
```typescript
// Validate provider
const validProviders = new Set([
  "opencode", "claude", "claude-code-sdk", "gemini", 
  "copilot", "auggie", "kimi", "kiro", "qoder", "codex"
]);

// Validate specialist exists
const specialist = params.specialistId 
  ? await getSpecialistById(params.specialistId)
  : null;
```

### Metadata storage:
```typescript
metadata: {
  ...params.metadata,
  ...(params.provider && { provider: params.provider }),
  ...(params.specialistId && { specialistId: params.specialistId }),
}
```

## Out of Scope

- Database schema changes (can be added later if needed)
- UI updates for provider/specialist selection
- Automatic provider selection based on agent capabilities
- Provider switching for running agents

## Labels

`enhancement`, `area:backend`, `complexity:small`
