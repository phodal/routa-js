#!/usr/bin/env node
/**
 * Cross-platform script to prepare the static frontend for Tauri bundling.
 *
 * 1. Runs `npm run build:static` to produce the Next.js static export in out/
 * 2. Removes apps/desktop/src-tauri/frontend/ if it exists
 * 3. Copies out/ -> apps/desktop/src-tauri/frontend/
 *
 * This replaces the Unix-only `rm -rf ... && cp -r ...` that was previously
 * in tauri.conf.json's beforeBuildCommand (which breaks on Windows).
 */
import { execSync } from "child_process";
import { cpSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { fileURLToPath } from "url";

const __dirname = join(fileURLToPath(import.meta.url), "..");
const rootDir = join(__dirname, "..");
const outDir = join(rootDir, "out");
const frontendDir = join(
  rootDir,
  "apps",
  "desktop",
  "src-tauri",
  "frontend"
);

try {
  // 1. Build the static frontend
  console.log("[prepare-frontend] Running build:static ...");
  execSync("npm run build:static", {
    cwd: rootDir,
    stdio: "inherit",
  });

  // 2. Remove old frontend dir
  if (existsSync(frontendDir)) {
    console.log("[prepare-frontend] Removing old frontend/ ...");
    rmSync(frontendDir, { recursive: true, force: true });
  }

  // 3. Copy out/ -> frontend/
  if (!existsSync(outDir)) {
    console.error("[prepare-frontend] ERROR: out/ directory not found after build.");
    process.exit(1);
  }

  console.log("[prepare-frontend] Copying out/ -> src-tauri/frontend/ ...");
  cpSync(outDir, frontendDir, { recursive: true });

  console.log("[prepare-frontend] Done.");
} catch (err) {
  console.error("[prepare-frontend] Failed:", err.message);
  process.exit(1);
}
