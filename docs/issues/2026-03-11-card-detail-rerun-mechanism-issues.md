---
date: 2026-03-11
status: resolved
severity: high
components: [kanban, mcp-tools, agent-trigger]
resolved_date: 2026-03-11
---

# Card Detail Rerun Mechanism Issues

## Problem Summary

The Card Detail Rerun mechanism has multiple issues:

1. **update_card tool not visible in MCP tools page** - The tool is registered but not showing up at http://localhost:3000/mcp-tools
2. **Agent prompt lacks MCP tool access** - Agents triggered from card detail don't have proper tool access configured
3. **Rerun mechanism doesn't provide task context** - The triggered agent doesn't receive proper task information

## Resolution

All issues have been fixed:

1. **Added `update_card` and `move_card` to essential mode** - Both tools are now registered in essential mode in `routa-mcp-tool-manager.ts` and included in `ESSENTIAL_TOOL_NAMES` in `mcp-tool-executor.ts`
2. **Enhanced `buildTaskPrompt` with tool usage instructions** - The prompt now includes:
   - Card ID for the agent to use with `update_card`
   - List of available MCP tools with descriptions
   - Step-by-step instructions for using tools
3. **Added card context to task prompt** - The prompt now includes the card ID, priority, labels, and GitHub issue URL

## Root Causes

### 1. update_card Tool Not Visible in MCP Tools Page

**Location:** `src/core/mcp/routa-mcp-tool-manager.ts` (line 1005-1027)

The `update_card` tool IS registered in the `registerTools()` method, but only in **"full" mode**:

```typescript
// Full mode: All tools
if (this.toolMode === "full") {
  // ... other tools ...
  this.registerUpdateCard(server);  // ← Only registered in full mode
}
```

However, the MCP tools page at `/mcp-tools` defaults to **"essential" mode**, which only includes 12 core coordination tools. The `update_card` tool is a Kanban tool and is excluded from essential mode.

**Evidence:**
- `src/app/mcp-tools/page.tsx` line 73: `const [essentialMode, setEssentialMode] = useState(true);`
- `src/core/mcp/routa-mcp-tool-manager.ts` line 95-120: Essential mode only registers Task (1), Agent (7), Note (5), and Artifact (6) tools

### 2. Agent Prompt Configuration Issues

**Location:** `src/core/kanban/agent-trigger.ts`

The `triggerAssignedTaskAgent()` function creates an ACP session but:

1. **No tool mode specified** - The session is created without specifying which MCP tools should be available
2. **Generic prompt** - The `buildTaskPrompt()` function (line 18-30) creates a simple text prompt without any tool usage instructions
3. **No specialist system prompt** - While the function accepts `task.assignedSpecialistId`, it doesn't load or inject the specialist's system prompt that would include tool usage instructions

```typescript
// Current implementation (line 33-75)
export async function triggerAssignedTaskAgent(params: {
  origin: string;
  workspaceId: string;
  cwd: string;
  branch?: string;
  task: Task;
}): Promise<{ sessionId?: string; error?: string }> {
  const { origin, workspaceId, cwd, branch, task } = params;
  const provider = task.assignedProvider ?? "opencode";
  const role = task.assignedRole ?? "CRAFTER";

  // Creates session but doesn't specify tool mode or load specialist prompt
  const newSessionResponse = await fetch(`${origin}/api/acp`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: uuidv4(),
      method: "session/new",
      params: {
        cwd,
        branch,
        provider,
        role,
        workspaceId,
        specialistId: task.assignedSpecialistId,  // ← Passed but not used properly
        name: `${task.title} · ${provider}`,
      },
    }),
  });
  // ...
}
```

### 3. Specialist System Prompt Not Loaded

**Location:** `src/app/api/acp/route.ts` (line 576-600)

The ACP route DOES load specialist system prompts when creating a session:

```typescript
// ── Load specialist system prompt ──────────────────────────────
let specialistSystemPrompt: string | undefined;

if (specialistId) {
  let specialist: { systemPrompt?: string; roleReminder?: string } | null | undefined;
  
  if (isPostgres()) {
    // Load from database
  } else {
    specialist = loadSpecialistsSync().find(s => s.id === specialistId.toLowerCase());
  }
  
  if (specialist?.systemPrompt) {
    let prompt = specialist.systemPrompt;
    if (specialist.roleReminder) {
      prompt += `\n\n---\n**Reminder:** ${specialist.roleReminder}`;
    }
    specialistSystemPrompt = prompt;
  }
}
```

However, the specialist system prompt should include instructions about which MCP tools are available and how to use them, particularly `update_card`.

## Impact

1. **Agents can't update cards** - Even if the agent knows it should update a card, the tool isn't available
2. **Poor agent behavior** - Without proper tool instructions in the system prompt, agents don't know what capabilities they have
3. **Inconsistent tool availability** - The MCP tools page shows one set of tools, but agents get a different set

## Recommended Fixes

### Fix 1: Add update_card to Essential Mode (if needed for card agents)

**File:** `src/core/mcp/routa-mcp-tool-manager.ts`

If card-assigned agents need to update cards, add `update_card` to essential mode:

```typescript
if (this.toolMode === "essential") {
  // ... existing essential tools ...
  
  // Kanban tools (for card-assigned agents)
  this.registerUpdateCard(server);
}
```

### Fix 2: Specify Tool Mode When Creating Card Agent Sessions

**File:** `src/core/kanban/agent-trigger.ts`

Add tool mode configuration to the session creation:

```typescript
const newSessionResponse = await fetch(`${origin}/api/acp`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "session/new",
    params: {
      cwd,
      branch,
      provider,
      role,
      workspaceId,
      specialistId: task.assignedSpecialistId,
      name: `${task.title} · ${provider}`,
      toolMode: "full",  // ← Add this to ensure all tools are available
    },
  }),
});
```

### Fix 3: Enhance buildTaskPrompt with Tool Usage Instructions

**File:** `src/core/kanban/agent-trigger.ts`

Update the prompt to include tool usage instructions:

```typescript
export function buildTaskPrompt(task: Task): string {
  const labels = task.labels.length > 0 ? `Labels: ${task.labels.join(", ")}` : "Labels: none";
  return [
    `You are assigned to Kanban task: ${task.title}`,
    "",
    task.objective,
    "",
    `Priority: ${task.priority ?? "medium"}`,
    labels,
    task.githubUrl ? `GitHub Issue: ${task.githubUrl}` : "GitHub Issue: local-only",
    "",
    "## Available Tools",
    "",
    "You have access to MCP tools including:",
    "- update_card: Update this card's title, description, priority, or labels",
    "- move_card: Move this card to a different column",
    "- create_note: Create notes for documentation",
    "- git_commit: Commit your changes",
    "",
    "Start implementation work immediately. Use update_card to track progress.",
    "Report completion using report_to_parent when done.",
  ].join("\n");
}
```

### Fix 4: Ensure Specialist Prompts Include Tool Instructions

**File:** Specialist configuration files or database

Ensure that specialist system prompts (especially for CRAFTER and DEVELOPER roles) include instructions about available MCP tools and when to use them.

## Testing Plan

1. **Test update_card visibility:**
   - Navigate to http://localhost:3000/mcp-tools
   - Toggle "Essential" mode OFF (switch to "Full" mode)
   - Verify `update_card` appears in the Kanban category

2. **Test card agent tool access:**
   - Create a card in the Kanban board
   - Assign it to an agent (provider + specialist)
   - Click "Run" or "Rerun"
   - Check the agent's session trace to verify:
     - MCP tools are available
     - Agent attempts to use `update_card` or other tools
     - Tool calls succeed

3. **Test specialist prompt injection:**
   - Create a session with a specialist
   - Verify the first prompt includes the specialist's system prompt
   - Check that tool usage instructions are present

## Related Files

- `src/core/mcp/routa-mcp-tool-manager.ts` - Tool registration
- `src/core/kanban/agent-trigger.ts` - Agent triggering logic
- `src/app/api/acp/route.ts` - ACP session management
- `src/app/mcp-tools/page.tsx` - MCP tools UI
- `src/app/workspace/[workspaceId]/kanban/kanban-card-detail.tsx` - Card detail UI
- `src/core/tools/kanban-tools.ts` - Kanban tool implementations

## Next Steps

1. Decide on tool mode strategy: Should card agents use "essential" or "full" mode?
2. If "essential", add necessary Kanban tools to essential mode
3. Update `triggerAssignedTaskAgent` to specify tool mode
4. Enhance `buildTaskPrompt` with tool usage instructions
5. Review and update specialist system prompts
6. Test the complete flow end-to-end
