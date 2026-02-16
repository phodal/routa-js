# Platform Abstraction Migration Guide

This guide shows how to migrate existing platform-specific code to use the
platform abstraction layer in `@/core/platform`.

## Quick Start

```typescript
import { getPlatformBridge, getServerBridge } from "@/core/platform";

// In client/shared code — auto-detects platform
const bridge = getPlatformBridge();

// In server-side code (API routes, server components) — always Web
const bridge = getServerBridge();
```

## Migration Examples

### 1. Process Spawning (child_process → bridge.process)

**Before:**
```typescript
import { spawn } from "child_process";

const proc = spawn(command, args, {
  stdio: ["pipe", "pipe", "pipe"],
  cwd,
  env: { ...process.env, ...env },
});
```

**After:**
```typescript
import { getServerBridge } from "@/core/platform";

const bridge = getServerBridge();
if (!bridge.process.isAvailable()) {
  throw new Error("Process spawning not available on this platform");
}

const proc = bridge.process.spawn(command, args, { cwd, env });
```

### 2. File System (fs → bridge.fs)

**Before:**
```typescript
import * as fs from "fs";
const content = fs.readFileSync(filePath, "utf-8");
const exists = fs.existsSync(dirPath);
```

**After:**
```typescript
import { getServerBridge } from "@/core/platform";

const bridge = getServerBridge();
const content = await bridge.fs.readTextFile(filePath);
const exists = await bridge.fs.exists(dirPath);
// Or sync (only on Web/Electron, throws on Tauri):
const contentSync = bridge.fs.readTextFileSync(filePath);
```

### 3. Git Operations (execSync → bridge.git)

**Before:**
```typescript
import { execSync } from "child_process";

function getCurrentBranch(repoPath: string): string {
  return execSync("git branch --show-current", { cwd: repoPath, encoding: "utf-8" }).trim();
}
```

**After:**
```typescript
import { getServerBridge } from "@/core/platform";

const bridge = getServerBridge();
const branch = await bridge.git.getCurrentBranch(repoPath);
```

### 4. Platform Detection (process.env → bridge.env)

**Before:**
```typescript
export function isServerlessEnvironment(): boolean {
  return !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}
```

**After:**
```typescript
import { getPlatformBridge, isServerless, isDesktop, isTauri } from "@/core/platform";

// Quick helpers
if (isServerless()) { /* Vercel, Lambda, etc. */ }
if (isDesktop()) { /* Tauri or Electron */ }
if (isTauri()) { /* Tauri only */ }

// Full bridge
const bridge = getPlatformBridge();
bridge.env.isServerless();
bridge.env.isTauri();
bridge.env.homeDir();
```

### 5. Database Selection

**Before:**
```typescript
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });
```

**After:**
```typescript
import { getServerBridge } from "@/core/platform";

const bridge = getServerBridge();
if (bridge.db.isDatabaseConfigured()) {
  const db = bridge.db.getDatabase();
  // db type depends on platform:
  //   - Web: NeonHttpDatabase
  //   - Tauri: BetterSQLite3Database
  //   - Electron: BetterSQLite3Database
}
```

### 6. Dialogs (Tauri/Electron only)

```typescript
import { getPlatformBridge } from "@/core/platform";

const bridge = getPlatformBridge();

// File open dialog
const filePath = await bridge.dialog.open({
  title: "Select workspace",
  directory: true,
});

// Native message dialog
await bridge.dialog.message("Task completed!", { type: "info" });
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Application Code                     │
│  (stores, orchestrator, tools, UI components)     │
├─────────────────────────────────────────────────┤
│          IPlatformBridge Interface                 │
│  (process, fs, db, git, terminal, dialog, ...)    │
├──────────┬──────────────┬───────────────────────┤
│ WebBridge│  TauriBridge │  ElectronBridge (future)│
│ (Node.js)│  (Tauri APIs)│  (IPC + Node.js)       │
└──────────┴──────────────┴───────────────────────┘
```

## Gradual Migration

You don't need to migrate everything at once. The existing code continues
to work. Start by migrating the most platform-coupled code:

1. **`acp-process.ts`** — spawn → `bridge.process.spawn()`
2. **`terminal-manager.ts`** — spawn → `bridge.terminal.create()`
3. **`git-utils.ts`** — execSync → `bridge.git.*`
4. **`api-based-providers.ts`** — env detection → `bridge.env.isServerless()`
5. **`db/index.ts`** — Neon-only → `bridge.db.getDatabase()`
6. **`skill-loader.ts`** / `specialist-file-loader.ts` — fs → `bridge.fs.*`
