/**
 * GitHub Webhook Handler
 *
 * Core logic for:
 * 1. Verifying HMAC-SHA256 webhook signatures from GitHub
 * 2. Matching incoming events to user-configured trigger rules
 * 3. Building prompt strings and dispatching background tasks to ACP agents
 * 4. Writing audit log entries
 *
 * This module is framework-agnostic — the Next.js route adapter calls it.
 */

import { createHmac, timingSafeEqual } from "crypto";
import { v4 as uuidv4 } from "uuid";
import type {
  GitHubWebhookStore,
  GitHubWebhookConfig,
  WebhookTriggerLog,
} from "../store/github-webhook-store";
import type { BackgroundTaskStore } from "../store/background-task-store";
import { createBackgroundTask } from "../models/background-task";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GitHubWebhookPayload {
  action?: string;
  issue?: {
    number: number;
    title: string;
    body?: string;
    html_url: string;
    labels?: Array<{ name: string }>;
    user?: { login: string };
  };
  pull_request?: {
    number: number;
    title: string;
    body?: string;
    html_url: string;
    state: string;
    user?: { login: string };
    head?: { ref: string; sha: string };
  };
  check_run?: {
    name: string;
    status: string;
    conclusion?: string;
    html_url: string;
  };
  repository?: {
    full_name: string;
    html_url: string;
  };
  sender?: { login: string };
  [key: string]: unknown;
}

export interface HandleWebhookOptions {
  /** Value of X-GitHub-Event header */
  eventType: string;
  /** Value of X-Hub-Signature-256 header (may be undefined) */
  signature?: string;
  /** Raw request body as a Buffer or string (for signature verification) */
  rawBody: string | Buffer;
  /** Parsed JSON payload */
  payload: GitHubWebhookPayload;
  /** Webhook store (to look up configs and write logs) */
  webhookStore: GitHubWebhookStore;
  /** Background task store (to dispatch tasks) */
  backgroundTaskStore: BackgroundTaskStore;
  /** Fixed workspace ID for background tasks */
  workspaceId?: string;
}

export interface HandleWebhookResult {
  processed: number;
  skipped: number;
  logs: WebhookTriggerLog[];
}

// ─── Signature Verification ──────────────────────────────────────────────────

/**
 * Verify a GitHub webhook HMAC-SHA256 signature.
 * Returns false if secret is empty (accepts all payloads — useful for dev).
 */
export function verifyGitHubSignature(
  secret: string,
  rawBody: string | Buffer,
  signature: string | undefined
): boolean {
  if (!secret) return true; // no secret configured → accept all
  if (!signature) return false;

  const body = typeof rawBody === "string" ? Buffer.from(rawBody) : rawBody;
  const expected = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

  try {
    return timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ─── Event Filtering ──────────────────────────────────────────────────────────

/**
 * Check whether a config should fire for a given event.
 */
export function eventMatchesConfig(
  config: GitHubWebhookConfig,
  eventType: string,
  payload: GitHubWebhookPayload
): boolean {
  if (!config.enabled) return false;

  // Check event type match
  const eventBase = eventType; // e.g. "issues", "pull_request"
  if (!config.eventTypes.includes(eventBase) && !config.eventTypes.includes("*")) {
    return false;
  }

  // Label filter (only applies to issue events)
  if (config.labelFilter && config.labelFilter.length > 0) {
    const issueLabels = payload.issue?.labels?.map((l) => l.name) ?? [];
    const hasAnyLabel = config.labelFilter.some((lf) => issueLabels.includes(lf));
    if (!hasAnyLabel) return false;
  }

  return true;
}

// ─── Prompt Builder ───────────────────────────────────────────────────────────

const DEFAULT_PROMPT_TEMPLATE = `A GitHub {{event}} event (action: {{action}}) was received on repository {{repo}}.

{{context}}

Please analyze this event and take appropriate action.`;

export function buildPrompt(
  config: GitHubWebhookConfig,
  eventType: string,
  payload: GitHubWebhookPayload
): string {
  const template = config.promptTemplate ?? DEFAULT_PROMPT_TEMPLATE;
  const action = payload.action ?? "unknown";
  const repo = payload.repository?.full_name ?? config.repo;

  // Build context section from payload
  const context = buildContextSection(eventType, payload);

  return template
    .replace(/\{\{event\}\}/g, eventType)
    .replace(/\{\{action\}\}/g, action)
    .replace(/\{\{repo\}\}/g, repo)
    .replace(/\{\{context\}\}/g, context)
    .replace(/\{\{payload\}\}/g, JSON.stringify(payload, null, 2));
}

function buildContextSection(eventType: string, payload: GitHubWebhookPayload): string {
  if (eventType === "issues" && payload.issue) {
    const issue = payload.issue;
    return [
      `Issue #${issue.number}: ${issue.title}`,
      `URL: ${issue.html_url}`,
      issue.body ? `\nDescription:\n${issue.body}` : "",
      issue.labels?.length
        ? `Labels: ${issue.labels.map((l) => l.name).join(", ")}`
        : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if ((eventType === "pull_request" || eventType === "pull_request_review") && payload.pull_request) {
    const pr = payload.pull_request;
    return [
      `PR #${pr.number}: ${pr.title}`,
      `URL: ${pr.html_url}`,
      `Branch: ${pr.head?.ref ?? "unknown"}`,
      pr.body ? `\nDescription:\n${pr.body}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }

  if (eventType === "check_run" && payload.check_run) {
    const cr = payload.check_run;
    return [
      `Check: ${cr.name}`,
      `Status: ${cr.status}, Conclusion: ${cr.conclusion ?? "pending"}`,
      `URL: ${cr.html_url}`,
    ].join("\n");
  }

  return JSON.stringify(payload, null, 2).slice(0, 1000);
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

export async function handleGitHubWebhook(
  opts: HandleWebhookOptions
): Promise<HandleWebhookResult> {
  const {
    eventType,
    signature,
    rawBody,
    payload,
    webhookStore,
    backgroundTaskStore,
    workspaceId = "default",
  } = opts;

  const logs: WebhookTriggerLog[] = [];
  let processed = 0;
  let skipped = 0;

  // Load all enabled configs
  const configs = await webhookStore.listConfigs();

  for (const config of configs) {
    // 1. Verify signature
    const signatureValid = verifyGitHubSignature(
      config.webhookSecret,
      rawBody,
      signature
    );

    if (!signatureValid) {
      const log = await webhookStore.appendLog({
        configId: config.id,
        eventType,
        eventAction: payload.action,
        payload,
        signatureValid: false,
        outcome: "error",
        errorMessage: "Webhook signature verification failed",
      });
      logs.push(log);
      skipped++;
      continue;
    }

    // 2. Check if this config matches the event
    if (!eventMatchesConfig(config, eventType, payload)) {
      skipped++;
      continue;
    }

    // 3. Build prompt and dispatch background task
    try {
      const prompt = buildPrompt(config, eventType, payload);
      const taskTitle = `[GitHub ${eventType}] ${payload.repository?.full_name ?? config.repo} — ${payload.action ?? "event"}`;

      const task = createBackgroundTask({
        id: uuidv4(),
        prompt,
        agentId: config.triggerAgentId,
        workspaceId: config.workspaceId ?? workspaceId,
        title: taskTitle,
        triggerSource: "webhook",
        triggeredBy: `github:${eventType}`,
        maxAttempts: 1,
      });

      await backgroundTaskStore.save(task);

      const log = await webhookStore.appendLog({
        configId: config.id,
        eventType,
        eventAction: payload.action,
        payload,
        backgroundTaskId: task.id,
        signatureValid: true,
        outcome: "triggered",
      });
      logs.push(log);
      processed++;
    } catch (err) {
      const log = await webhookStore.appendLog({
        configId: config.id,
        eventType,
        eventAction: payload.action,
        payload,
        signatureValid: true,
        outcome: "error",
        errorMessage: String(err),
      });
      logs.push(log);
      skipped++;
    }
  }

  return { processed, skipped, logs };
}

// ─── GitHub Repository Hooks API ─────────────────────────────────────────────

/**
 * Register a webhook on a GitHub repository using the GitHub API.
 * Requires a token with admin:repo_hook or repo scope.
 */
export async function registerGitHubWebhook(opts: {
  token: string;
  repo: string; // "owner/repo"
  webhookUrl: string;
  secret: string;
  events: string[];
}): Promise<{ id: number; url: string }> {
  const { token, repo, webhookUrl, secret, events } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/hooks`;

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    body: JSON.stringify({
      name: "web",
      active: true,
      events,
      config: {
        url: webhookUrl,
        content_type: "json",
        secret,
        insecure_ssl: "0",
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  const data = (await response.json()) as { id: number; config: { url: string } };
  return { id: data.id, url: data.config.url };
}

/**
 * Delete a webhook from a GitHub repository.
 */
export async function deleteGitHubWebhook(opts: {
  token: string;
  repo: string;
  hookId: number;
}): Promise<void> {
  const { token, repo, hookId } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/hooks/${hookId}`;

  const response = await fetch(apiUrl, {
    method: "DELETE",
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok && response.status !== 404) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }
}

/**
 * List webhooks for a GitHub repository.
 */
export async function listGitHubWebhooks(opts: {
  token: string;
  repo: string;
}): Promise<Array<{ id: number; events: string[]; active: boolean; config: { url: string } }>> {
  const { token, repo } = opts;
  const apiUrl = `https://api.github.com/repos/${repo}/hooks`;

  const response = await fetch(apiUrl, {
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API error ${response.status}: ${body}`);
  }

  return response.json();
}
