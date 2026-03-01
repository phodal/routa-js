/**
 * GitHub Polling Adapter
 *
 * Alternative to webhooks for local development and environments without public IP.
 * Periodically polls GitHub Events API to detect changes and triggers the same
 * event processing pipeline as webhooks.
 *
 * Features:
 * - Configurable polling interval (default: 30s)
 * - Event deduplication via lastEventId tracking
 * - Rate limit awareness (GitHub API: 5000 req/hour)
 * - Reuses existing webhook handler logic for event processing
 */

import { v4 as uuidv4 } from "uuid";
import type {
  GitHubWebhookStore,
  GitHubWebhookConfig,
} from "../store/github-webhook-store";
import type { BackgroundTaskStore } from "../store/background-task-store";
import {
  eventMatchesConfig,
  buildPrompt,
  type GitHubWebhookPayload,
} from "../webhooks/github-webhook-handler";
import { createBackgroundTask } from "../models/background-task";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PollingConfig {
  enabled: boolean;
  intervalSeconds: number;
  /** Last processed event ID per repo (for deduplication) */
  lastEventIds: Record<string, string>;
  lastCheckedAt?: Date;
}

export interface GitHubEvent {
  id: string;
  type: string;
  actor: { login: string; avatar_url?: string };
  repo: { name: string };
  payload: Record<string, unknown>;
  created_at: string;
}

export interface PollResult {
  repo: string;
  eventsFound: number;
  eventsProcessed: number;
  eventsSkipped: number;
  newLastEventId?: string;
  error?: string;
}

// ─── Event Type Mapping ──────────────────────────────────────────────────────

/** Maps GitHub Events API event types to webhook event types */
const EVENT_TYPE_MAP: Record<string, string> = {
  IssuesEvent: "issues",
  PullRequestEvent: "pull_request",
  PullRequestReviewEvent: "pull_request_review",
  PullRequestReviewCommentEvent: "pull_request_review_comment",
  CheckRunEvent: "check_run",
  CheckSuiteEvent: "check_suite",
  WorkflowRunEvent: "workflow_run",
  WorkflowJobEvent: "workflow_job",
  PushEvent: "push",
  CreateEvent: "create",
  DeleteEvent: "delete",
  IssueCommentEvent: "issue_comment",
};

// ─── Polling Adapter ─────────────────────────────────────────────────────────

export class GitHubPollingAdapter {
  private pollingTimer: ReturnType<typeof setInterval> | null = null;
  private config: PollingConfig = {
    enabled: false,
    intervalSeconds: 30,
    lastEventIds: {},
  };

  constructor(
    private webhookStore: GitHubWebhookStore,
    private backgroundTaskStore: BackgroundTaskStore,
    private workspaceId: string = "default"
  ) {}

  // ─── Configuration ─────────────────────────────────────────────────────────

  getConfig(): PollingConfig {
    return { ...this.config };
  }

  updateConfig(partial: Partial<PollingConfig>): void {
    this.config = { ...this.config, ...partial };
    // Restart if interval changed while running
    if (partial.intervalSeconds && this.pollingTimer) {
      this.stop();
      this.start();
    }
  }

  isRunning(): boolean {
    return this.pollingTimer !== null;
  }

  // ─── Start/Stop ────────────────────────────────────────────────────────────

  start(): void {
    if (this.pollingTimer || !this.config.enabled) return;
    const intervalMs = this.config.intervalSeconds * 1000;
    this.pollingTimer = setInterval(() => {
      void this.pollAllRepos();
    }, intervalMs);
    console.log(`[GitHubPolling] Started with ${this.config.intervalSeconds}s interval`);
    // Run immediately on start
    void this.pollAllRepos();
  }

  stop(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
      console.log("[GitHubPolling] Stopped");
    }
  }

  // ─── Manual Check ──────────────────────────────────────────────────────────

  async checkNow(): Promise<PollResult[]> {
    return this.pollAllRepos();
  }

  // ─── Core Polling Logic ────────────────────────────────────────────────────

  async pollAllRepos(): Promise<PollResult[]> {
    const configs = await this.webhookStore.listConfigs();
    const enabledConfigs = configs.filter((c) => c.enabled);

    // Get unique repos
    const repos = [...new Set(enabledConfigs.map((c) => c.repo))];
    const results: PollResult[] = [];

    for (const repo of repos) {
      const repoConfigs = enabledConfigs.filter((c) => c.repo === repo);
      const result = await this.pollRepo(repo, repoConfigs);
      results.push(result);
    }

    this.config.lastCheckedAt = new Date();
    return results;
  }

  async pollRepo(repo: string, configs: GitHubWebhookConfig[]): Promise<PollResult> {
    const result: PollResult = { repo, eventsFound: 0, eventsProcessed: 0, eventsSkipped: 0 };

    // Use first config's token (they should all be for the same repo)
    const token = configs[0]?.githubToken;
    if (!token) {
      result.error = "No GitHub token configured";
      return result;
    }

    try {
      const events = await this.fetchRepoEvents(repo, token);
      result.eventsFound = events.length;

      const lastEventId = this.config.lastEventIds[repo];
      let foundLastEvent = !lastEventId; // If no lastEventId, process all

      for (const event of events) {
        // Skip already processed events
        if (event.id === lastEventId) {
          foundLastEvent = true;
          continue;
        }
        if (!foundLastEvent) continue; // Haven't reached our marker yet

        // Update newest event ID
        if (!result.newLastEventId) {
          result.newLastEventId = event.id;
        }

        // Process this event
        const processed = await this.processEvent(event, configs);
        if (processed) {
          result.eventsProcessed++;
        } else {
          result.eventsSkipped++;
        }
      }

      // Update last event ID
      if (result.newLastEventId) {
        this.config.lastEventIds[repo] = result.newLastEventId;
      }
    } catch (err) {
      result.error = err instanceof Error ? err.message : String(err);
      console.error(`[GitHubPolling] Error polling ${repo}:`, err);
    }

    return result;
  }

  private async fetchRepoEvents(repo: string, token: string): Promise<GitHubEvent[]> {
    const url = `https://api.github.com/repos/${repo}/events?per_page=30`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2024-11-28",
      },
    });

    if (!response.ok) {
      const rateRemaining = response.headers.get("x-ratelimit-remaining");
      if (response.status === 403 && rateRemaining === "0") {
        throw new Error("GitHub API rate limit exceeded");
      }
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  private async processEvent(
    event: GitHubEvent,
    configs: GitHubWebhookConfig[]
  ): Promise<boolean> {
    const webhookEventType = EVENT_TYPE_MAP[event.type];
    if (!webhookEventType) {
      return false; // Unknown event type
    }

    // Convert GitHub Events API payload to webhook payload format
    const payload = this.convertToWebhookPayload(event);

    let triggered = false;
    for (const config of configs) {
      if (!eventMatchesConfig(config, webhookEventType, payload)) {
        continue;
      }

      try {
        const prompt = buildPrompt(config, webhookEventType, payload);
        const taskTitle = `[GitHub ${webhookEventType}] ${event.repo.name} — ${payload.action ?? "event"} (polled)`;

        const task = createBackgroundTask({
          id: uuidv4(),
          prompt,
          agentId: config.triggerAgentId,
          workspaceId: config.workspaceId ?? this.workspaceId,
          title: taskTitle,
          triggerSource: "polling",
          triggeredBy: `github:${webhookEventType}`,
          maxAttempts: 1,
        });

        await this.backgroundTaskStore.save(task);

        // Log the trigger
        await this.webhookStore.appendLog({
          configId: config.id,
          eventType: webhookEventType,
          eventAction: payload.action,
          payload,
          backgroundTaskId: task.id,
          signatureValid: true, // No signature for polling
          outcome: "triggered",
        });

        triggered = true;
        console.log(`[GitHubPolling] Triggered task for ${webhookEventType} on ${event.repo.name}`);
      } catch (err) {
        console.error(`[GitHubPolling] Error processing event:`, err);
        await this.webhookStore.appendLog({
          configId: config.id,
          eventType: webhookEventType,
          eventAction: payload.action,
          payload,
          signatureValid: true,
          outcome: "error",
          errorMessage: String(err),
        });
      }
    }

    return triggered;
  }

  private convertToWebhookPayload(event: GitHubEvent): GitHubWebhookPayload {
    const payload = event.payload as Record<string, unknown>;

    // The Events API payload structure is slightly different from webhooks
    // Map common fields
    const converted: GitHubWebhookPayload = {
      action: payload.action as string | undefined,
      repository: {
        full_name: event.repo.name,
        html_url: `https://github.com/${event.repo.name}`,
      },
      sender: {
        login: event.actor.login,
      },
    };

    // Map event-specific fields
    if (payload.issue) {
      converted.issue = payload.issue as GitHubWebhookPayload["issue"];
    }
    if (payload.pull_request) {
      converted.pull_request = payload.pull_request as GitHubWebhookPayload["pull_request"];
    }
    if (payload.review) {
      converted.review = payload.review as GitHubWebhookPayload["review"];
    }
    if (payload.comment) {
      converted.comment = payload.comment as GitHubWebhookPayload["comment"];
    }
    if (payload.check_run) {
      converted.check_run = payload.check_run as GitHubWebhookPayload["check_run"];
    }
    if (payload.check_suite) {
      converted.check_suite = payload.check_suite as GitHubWebhookPayload["check_suite"];
    }
    if (payload.workflow_run) {
      converted.workflow_run = payload.workflow_run as GitHubWebhookPayload["workflow_run"];
    }
    if (payload.workflow_job) {
      converted.workflow_job = payload.workflow_job as GitHubWebhookPayload["workflow_job"];
    }
    if (payload.ref) {
      converted.ref = payload.ref as string;
    }
    if (payload.ref_type) {
      const refType = payload.ref_type as string;
      if (refType === "branch" || refType === "tag") {
        converted.ref_type = refType;
      }
    }

    return converted;
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let pollingAdapterInstance: GitHubPollingAdapter | null = null;

export function getPollingAdapter(
  webhookStore: GitHubWebhookStore,
  backgroundTaskStore: BackgroundTaskStore,
  workspaceId?: string
): GitHubPollingAdapter {
  if (!pollingAdapterInstance) {
    pollingAdapterInstance = new GitHubPollingAdapter(
      webhookStore,
      backgroundTaskStore,
      workspaceId
    );
  }
  return pollingAdapterInstance;
}

export function resetPollingAdapter(): void {
  if (pollingAdapterInstance) {
    pollingAdapterInstance.stop();
    pollingAdapterInstance = null;
  }
}

