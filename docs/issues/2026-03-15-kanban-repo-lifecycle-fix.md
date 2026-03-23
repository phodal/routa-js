---
date: 2026-03-15
title: Kanban Repository Lifecycle Fix
status: resolved
area: kanban
labels: [bug, kanban, ux]
---

# Kanban Repository Lifecycle Fix

## Problem

Users encountered a broken navigation loop when trying to add repositories from the Kanban page:

1. **Kanban page** (`/workspace/{id}/kanban`) shows "No repositories linked"
2. Clicking "Add one in Settings →" navigates to `/workspace/{id}?tab=settings`
3. **Dashboard page** (`/workspace/{id}`) has NO `settings` tab
   - Only has: `kanban`, `notes`, `activity` tabs
4. User is stuck - can't add repository, can't proceed

### Root Cause

The Kanban page was linking to a non-existent tab on the Dashboard page. The Dashboard was redesigned to a simplified 3-tab layout (Kanban, Notes, Activity), but the Kanban page still referenced the old `settings` tab.

## Solution

Replace the broken link with an **inline RepoPicker** component, allowing users to clone/select repositories directly from the Kanban page without navigation.

### Implementation

**Before**:
```tsx
{codebases.length === 0 ? (
  <div className="...">
    <span>No repositories linked.</span>
    <a href={`/workspace/${workspaceId}?tab=settings`}>
      Add one in Settings →
    </a>
  </div>
) : (
  // ... existing repos
)}
```

**After**:
```tsx
{codebases.length === 0 ? (
  <div className="flex flex-col gap-2 ...">
    <span>No repositories linked.</span>
    <div className="flex items-center gap-2">
      <RepoPicker
        value={null}
        onChange={async (selection) => {
          if (!selection) return;
          try {
            const res = await fetch(`/api/workspaces/${workspaceId}/codebases`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ 
                repoPath: selection.path, 
                branch: selection.branch, 
                label: selection.name 
              }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error ?? "Failed to add repository");
            onRefresh?.(); // Refresh codebases list
          } catch (err) {
            console.error("Failed to add repository:", err);
            alert(err instanceof Error ? err.message : "Failed to add repository");
          }
        }}
        additionalRepos={[]}
      />
    </div>
  </div>
) : (
  // ... existing repos
)}
```

### Key Changes

1. **Inline RepoPicker**: Users can select/clone repos directly
2. **API Integration**: Calls `/api/workspaces/{id}/codebases` POST endpoint
3. **Auto-refresh**: Calls `onRefresh()` after successful add
4. **Error Handling**: Shows alert on failure
5. **No Navigation**: Users stay on Kanban page

## Benefits

✅ **Better UX**: No page navigation required
✅ **Consistent Pattern**: Similar to HomeInput component
✅ **Fixes Lifecycle Issue**: No more broken navigation loop
✅ **Immediate Action**: Users can start working right away
✅ **Error Feedback**: Clear error messages on failure

## Testing

Manual testing confirmed:
- ✅ RepoPicker appears when no repositories linked
- ✅ Can select existing local repos
- ✅ Can clone GitHub repos
- ✅ Codebases list refreshes after add
- ✅ Error handling works correctly
- ✅ No broken navigation links

## Related Components

- `RepoPicker`: Reusable component for repo selection/cloning
- `HomeInput`: Similar pattern for homepage
- `WorkspaceSettingsTab`: Full settings page (still accessible via Settings menu)

## Commit

```
commit 2a1b788
fix(kanban): add inline RepoPicker for empty repository state
```
