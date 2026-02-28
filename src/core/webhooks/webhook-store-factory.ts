/**
 * GitHub Webhook Store Factory
 *
 * Returns the appropriate webhook store based on the current DB driver.
 * Uses the same singleton pattern as getRoutaSystem().
 */

import type { GitHubWebhookStore } from "../store/github-webhook-store";

const GLOBAL_KEY = "__routa_github_webhook_store__";

export function getGitHubWebhookStore(): GitHubWebhookStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[GLOBAL_KEY]) {
    const { getDatabaseDriver } = require("../db/index") as typeof import("../db/index");
    const driver = getDatabaseDriver();

    if (driver === "postgres") {
      const { getPostgresDatabase } = require("../db/index") as typeof import("../db/index");
      const { PgGitHubWebhookStore } = require("../store/github-webhook-store") as typeof import("../store/github-webhook-store");
      const db = getPostgresDatabase();
      g[GLOBAL_KEY] = new PgGitHubWebhookStore(db);
    } else if (driver === "sqlite") {
      try {
        // eslint-disable-next-line no-eval
        const dynamicRequire = eval("require") as NodeRequire;
        const { getSqliteDatabase } = dynamicRequire("../db/sqlite");
        const { SqliteGitHubWebhookStore } = require("../store/github-webhook-store") as typeof import("../store/github-webhook-store");
        const db = getSqliteDatabase();
        g[GLOBAL_KEY] = new SqliteGitHubWebhookStore(db);
      } catch {
        const { InMemoryGitHubWebhookStore } = require("../store/github-webhook-store") as typeof import("../store/github-webhook-store");
        g[GLOBAL_KEY] = new InMemoryGitHubWebhookStore();
      }
    } else {
      const { InMemoryGitHubWebhookStore } = require("../store/github-webhook-store") as typeof import("../store/github-webhook-store");
      g[GLOBAL_KEY] = new InMemoryGitHubWebhookStore();
    }
  }
  return g[GLOBAL_KEY] as GitHubWebhookStore;
}
