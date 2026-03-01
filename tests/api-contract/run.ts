#!/usr/bin/env npx tsx
/**
 * Shared API Contract Test Runner
 *
 * Runs the same test suite against either backend to verify behavioral parity.
 *
 * Usage:
 *   BASE_URL=http://localhost:3000 npx tsx tests/api-contract/run.ts   # Next.js
 *   BASE_URL=http://localhost:3210 npx tsx tests/api-contract/run.ts   # Rust
 *
 * Options:
 *   --json          Output results as JSON
 *   --suite=agents  Run only a specific suite (agents, tasks, notes, workspaces, sessions, skills)
 *   --bail          Stop on first failure
 */

import { BASE_URL, type TestResult } from "./helpers";
import { testAgents } from "./test-agents";
import { testTasks } from "./test-tasks";
import { testNotes } from "./test-notes";
import { testWorkspaces } from "./test-workspaces";
import { testSessions, testSkills } from "./test-sessions";
import { testSchemaValidation } from "./test-schema-validation";

const jsonMode = process.argv.includes("--json");
const bail = process.argv.includes("--bail");
const suiteArg = process.argv.find((a) => a.startsWith("--suite="));
const suiteName = suiteArg?.split("=")[1];

interface SuiteResult {
  suite: string;
  results: TestResult[];
  passed: number;
  failed: number;
}

const suites: { name: string; run: () => Promise<TestResult[]> }[] = [
  { name: "workspaces", run: testWorkspaces },
  { name: "agents", run: testAgents },
  { name: "tasks", run: testTasks },
  { name: "notes", run: testNotes },
  { name: "sessions", run: testSessions },
  { name: "skills", run: testSkills },
  { name: "schema-validation", run: testSchemaValidation },
];

async function checkBackendAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(`${BASE_URL}/api/sessions`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!jsonMode) {
    console.log("\n╔══════════════════════════════════════════════════╗");
    console.log("║       Routa.js API Contract Test Suite           ║");
    console.log("╚══════════════════════════════════════════════════╝\n");
    console.log(`🎯 Target: ${BASE_URL}`);
  }

  // Check backend availability
  const available = await checkBackendAvailable();
  if (!available) {
    if (jsonMode) {
      console.log(JSON.stringify({ error: `Backend not available at ${BASE_URL}` }));
    } else {
      console.error(`\n❌ Backend not available at ${BASE_URL}`);
      console.error("   Start the backend first:\n");
      console.error("   Next.js:  npm run dev");
      console.error("   Rust:     cargo run -p routa-server\n");
    }
    process.exit(1);
  }

  if (!jsonMode) {
    console.log("✅ Backend is reachable\n");
  }

  const allSuiteResults: SuiteResult[] = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let bailTriggered = false;

  const suitesToRun = suiteName
    ? suites.filter((s) => s.name === suiteName)
    : suites;

  if (suitesToRun.length === 0) {
    console.error(`Unknown suite: ${suiteName}`);
    console.error(`Available: ${suites.map((s) => s.name).join(", ")}`);
    process.exit(1);
  }

  for (const suite of suitesToRun) {
    if (bailTriggered) break;

    if (!jsonMode) {
      console.log(`── ${suite.name} ──────────────────────────────────`);
    }

    let results: TestResult[];
    try {
      results = await suite.run();
    } catch (err) {
      results = [
        {
          name: `${suite.name} (suite error)`,
          passed: false,
          error: err instanceof Error ? err.message : String(err),
          duration: 0,
        },
      ];
    }

    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    allSuiteResults.push({ suite: suite.name, results, passed, failed });
    totalPassed += passed;
    totalFailed += failed;

    if (!jsonMode) {
      for (const r of results) {
        const icon = r.passed ? "  ✅" : "  ❌";
        const time = `(${r.duration}ms)`;
        console.log(`${icon} ${r.name} ${time}`);
        if (!r.passed && r.error) {
          console.log(`     → ${r.error}`);
        }
      }
      console.log(`   ${passed}/${results.length} passed\n`);
    }

    if (bail && failed > 0) {
      bailTriggered = true;
    }
  }

  // Summary
  if (jsonMode) {
    console.log(
      JSON.stringify(
        {
          target: BASE_URL,
          totalPassed,
          totalFailed,
          totalTests: totalPassed + totalFailed,
          suites: allSuiteResults.map((s) => ({
            suite: s.suite,
            passed: s.passed,
            failed: s.failed,
            tests: s.results,
          })),
        },
        null,
        2
      )
    );
  } else {
    console.log("══════════════════════════════════════════════════");
    console.log(
      `  Total: ${totalPassed + totalFailed} tests | ` +
        `✅ ${totalPassed} passed | ` +
        `❌ ${totalFailed} failed`
    );
    console.log("══════════════════════════════════════════════════\n");
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
