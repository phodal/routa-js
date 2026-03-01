#!/usr/bin/env node
/**
 * Build script for Tauri static export.
 *
 * Next.js `output: 'export'` cannot include API routes (they require a server).
 * This script temporarily moves the API directory out of the way, runs the
 * static build, then restores it.
 */
import { execSync } from "child_process";
import { renameSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const rootDir = join(fileURLToPath(import.meta.url), "..", "..");
const apiDir = join(rootDir, "src/app/api");
const apiBackup = join(rootDir, "src/app/_api_excluded");
const wellKnownDir = join(rootDir, "src/app/.well-known");
const wellKnownBackup = join(rootDir, "src/app/_well-known_excluded");

function moveDir(from, to) {
  if (existsSync(from)) {
    renameSync(from, to);
  }
}

let buildFailed = false;

try {
  console.log("[build-static] Temporarily excluding API routes and .well-known...");
  moveDir(apiDir, apiBackup);
  moveDir(wellKnownDir, wellKnownBackup);

  console.log("[build-static] Running Next.js static export...");
  execSync("npx next build", {
    cwd: rootDir,
    stdio: "inherit",
    env: { ...process.env, ROUTA_BUILD_STATIC: "1", SKIP_ENV_VALIDATION: "1" },
  });

  console.log("[build-static] Static export completed successfully.");
} catch (err) {
  buildFailed = true;
  console.error("[build-static] Build failed:", err.message);
} finally {
  console.log("[build-static] Restoring API routes and .well-known...");
  moveDir(apiBackup, apiDir);
  moveDir(wellKnownBackup, wellKnownDir);

  if (buildFailed) {
    process.exit(1);
  }
}
