#!/usr/bin/env node
/**
 * Post-build step for Docker: compile SQLite modules into the Next.js
 * standalone output so that ROUTA_DB_DRIVER=sqlite works at runtime.
 *
 * createSqliteSystem() loads SQLite via:
 *   eval("require")("./db/sqlite")
 *   eval("require")("./db/sqlite-stores")
 *
 * This resolves relative to the webpack chunk file inside the standalone
 * server's chunks directory (.next/standalone/.next/server/chunks/).
 * We compile the TypeScript sources with esbuild and place the CJS bundles
 * at .next/standalone/.next/server/chunks/db/ so the dynamic require finds
 * them at runtime.
 *
 * Run this script after `npm run build:docker`:
 *   node scripts/build-docker.mjs
 */

import { execSync } from "child_process";
import { cpSync, existsSync, mkdirSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

const standaloneDir = path.join(root, ".next", "standalone");
const chunksDir = path.join(standaloneDir, ".next", "server", "chunks");
const targetDbDir = path.join(chunksDir, "db");

function run(cmd) {
  execSync(cmd, { cwd: root, stdio: "inherit" });
}

function ensureDir(dir) {
  mkdirSync(dir, { recursive: true });
}

if (!existsSync(standaloneDir)) {
  throw new Error(
    `Standalone output not found at ${standaloneDir}. ` +
      "Run `npm run build:docker` first."
  );
}

// ── Compile SQLite TypeScript modules ─────────────────────────────────────
console.log("[build-docker] Compiling SQLite modules with esbuild...");
ensureDir(targetDbDir);

const sqliteSources = [
  { entry: "src/core/db/sqlite-schema.ts", out: "sqlite-schema.js" },
  { entry: "src/core/db/sqlite.ts", out: "sqlite.js" },
  { entry: "src/core/db/sqlite-stores.ts", out: "sqlite-stores.js" },
];

for (const { entry, out } of sqliteSources) {
  const outfile = path.join(targetDbDir, out);
  run(
    `npx esbuild ${entry} --bundle --platform=node --format=cjs ` +
      `--external:better-sqlite3 --outfile=${outfile}`
  );
  console.log(`  ✓ ${out}`);
}

// ── Copy better-sqlite3 native module ─────────────────────────────────────
const betterSqliteSrc = path.join(root, "node_modules", "better-sqlite3");
const betterSqliteDst = path.join(standaloneDir, "node_modules", "better-sqlite3");

if (existsSync(betterSqliteSrc)) {
  console.log("[build-docker] Copying better-sqlite3 (with native addon)...");
  ensureDir(betterSqliteDst);
  cpSync(betterSqliteSrc, betterSqliteDst, { recursive: true });

  // Copy node-gyp-build (required to load the native addon)
  const ngbSrc = path.join(root, "node_modules", "node-gyp-build");
  const ngbDst = path.join(standaloneDir, "node_modules", "node-gyp-build");
  if (existsSync(ngbSrc) && !existsSync(ngbDst)) {
    cpSync(ngbSrc, ngbDst, { recursive: true });
  }

  // Copy bindings if present
  const bindingsSrc = path.join(root, "node_modules", "bindings");
  const bindingsDst = path.join(standaloneDir, "node_modules", "bindings");
  if (existsSync(bindingsSrc) && !existsSync(bindingsDst)) {
    cpSync(bindingsSrc, bindingsDst, { recursive: true });
  }

  // Copy file-uri-to-path (used by bindings)
  const furiSrc = path.join(root, "node_modules", "file-uri-to-path");
  const furiDst = path.join(standaloneDir, "node_modules", "file-uri-to-path");
  if (existsSync(furiSrc) && !existsSync(furiDst)) {
    cpSync(furiSrc, furiDst, { recursive: true });
  }

  console.log("  ✓ better-sqlite3 with native addon copied");
} else {
  console.warn(
    "[build-docker] WARNING: better-sqlite3 not found in node_modules. " +
      "SQLite will fall back to in-memory storage."
  );
}

console.log("[build-docker] Done.");
