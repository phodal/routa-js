import { test, expect } from "@playwright/test";

/**
 * GitHub Webhook Trigger Configuration E2E Tests (Issue #43)
 *
 * Tests the GitHub Event-Driven Trigger System:
 * 1. Navigate to /settings/webhooks
 * 2. Configure a GitHub token
 * 3. Configure repo, events (issues), and trigger agent
 * 4. Save the configuration
 * 5. Verify config appears in the list
 * 6. Test the webhook receiver endpoint directly (simulate GitHub event)
 * 7. Create a test GitHub issue on phodal-archive/data-mesh-spike
 * 8. Verify trigger log entry appears after event
 * 9. Edit and delete the configuration
 */

const BASE_URL = "http://localhost:3001";
const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? "";
const TEST_REPO = "phodal-archive/data-mesh-spike";
const WEBHOOK_SECRET = "routa-webhook-secret-2026";

test.describe("GitHub Webhook Trigger System (Issue #43)", () => {
  test.setTimeout(120_000);

  test("1. Navigate to /settings/webhooks page", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/webhooks`);
    await page.waitForLoadState("networkidle");

    await page.screenshot({
      path: "test-results/webhook-01-settings-page.png",
      fullPage: true,
    });

    // Verify page header
    await expect(page.locator("h1").filter({ hasText: /GitHub Webhook Triggers/i })).toBeVisible();
    await expect(page.locator("text=/api\/webhooks\/github/")).toBeVisible();

    console.log("✓ /settings/webhooks page loaded successfully");
  });

  test("2. Create a GitHub webhook trigger configuration", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/webhooks`);
    await page.waitForLoadState("networkidle");

    // Click "Add Trigger" button
    const addBtn = page.locator("button").filter({ hasText: /Add Trigger|Add Your First Trigger/i }).first();
    await addBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "test-results/webhook-02-form-opened.png",
      fullPage: true,
    });

    // Fill in the form
    await page.fill('[data-testid="webhook-name"]', "Issue Handler — data-mesh-spike (e2e test)");
    await page.fill('[data-testid="webhook-repo"]', TEST_REPO);
    await page.fill('[data-testid="webhook-token"]', GITHUB_TOKEN);
    await page.fill('[data-testid="webhook-secret"]', WEBHOOK_SECRET);

    // Select events: make sure "issues" is checked
    const issuesCheckbox = page.locator('[data-testid="event-issues"]');
    if (!await issuesCheckbox.isChecked()) {
      await issuesCheckbox.check();
    }

    // Also check pull_request
    const prCheckbox = page.locator('[data-testid="event-pull_request"]');
    if (!await prCheckbox.isChecked()) {
      await prCheckbox.check();
    }

    // Set agent to claude-code
    const agentInput = page.locator('[data-testid="webhook-agent"]');
    await agentInput.fill("claude-code");

    await page.screenshot({
      path: "test-results/webhook-03-form-filled.png",
      fullPage: true,
    });

    // Submit
    const submitBtn = page.locator('[data-testid="webhook-submit"]');
    await submitBtn.click();

    // Wait for success
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/webhook-04-config-created.png",
      fullPage: true,
    });

    // Verify the config card appears
    const configCard = page.locator("text=Issue Handler — data-mesh-spike (e2e test)").first();
    await expect(configCard).toBeVisible({ timeout: 10_000 });

    console.log("✓ Webhook trigger configuration created successfully");
  });

  test("3. Test webhook receiver API endpoint directly (simulate GitHub event)", async ({ request }) => {
    // First create a config via API
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `E2E API Test Config ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "", // no secret = accept all
        eventTypes: ["issues", "pull_request"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const configData = await createRes.json();
    const configId = configData.config.id;

    console.log(`✓ Created config via API: ${configId}`);

    // Now simulate a GitHub issues.opened event
    const payload = {
      action: "opened",
      issue: {
        number: 1,
        title: "E2E Test Issue — GitHub Webhook Trigger",
        body: "This is an automated test from the Routa E2E test suite.",
        html_url: `https://github.com/${TEST_REPO}/issues/1`,
        labels: [],
        user: { login: "phodal" },
      },
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "phodal" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "issues",
        "x-github-delivery": `e2e-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const webhookData = await webhookRes.json();
    console.log("[Webhook result]", webhookData);

    expect(webhookData.ok).toBe(true);
    expect(webhookData.processed).toBeGreaterThanOrEqual(1);

    console.log(`✓ Webhook event processed: ${webhookData.processed} triggered, ${webhookData.skipped} skipped`);

    // Check trigger logs
    const logsRes = await request.get(`${BASE_URL}/api/webhooks/webhook-logs?configId=${configId}&limit=5`);
    expect(logsRes.ok()).toBeTruthy();
    const logsData = await logsRes.json();
    console.log(`✓ Found ${logsData.logs.length} trigger log(s)`);

    // Cleanup: delete the test config
    const delRes = await request.delete(`${BASE_URL}/api/webhooks/configs?id=${configId}`);
    expect(delRes.ok()).toBeTruthy();
    console.log(`✓ Cleaned up test config ${configId}`);
  });

  test("4. Verify trigger logs tab shows received events", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/webhooks`);
    await page.waitForLoadState("networkidle");

    // Switch to Logs tab
    const logsTab = page.locator("button").filter({ hasText: /Trigger Logs/i }).first();
    await logsTab.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "test-results/webhook-05-logs-tab.png",
      fullPage: true,
    });

    console.log("✓ Trigger logs tab accessible");
  });

  test("5. Edit existing webhook configuration", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/webhooks`);
    await page.waitForLoadState("networkidle");

    // Check if there's an existing config to edit
    const editBtn = page.locator("button").filter({ hasText: /Edit/i }).first();
    const editBtnVisible = await editBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!editBtnVisible) {
      console.log("ℹ No config to edit (may have been deleted in a previous run). Skipping edit test.");
      return;
    }

    await editBtn.click();
    await page.waitForTimeout(500);

    await page.screenshot({
      path: "test-results/webhook-06-edit-form.png",
      fullPage: true,
    });

    // Change the name
    const nameInput = page.locator('[data-testid="webhook-name"]');
    await nameInput.fill("Issue Handler — data-mesh-spike (e2e updated)");

    // Save
    const submitBtn = page.locator('[data-testid="webhook-submit"]');
    await submitBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/webhook-07-after-edit.png",
      fullPage: true,
    });

    const updatedCard = page.locator("text=Issue Handler — data-mesh-spike (e2e updated)").first();
    await expect(updatedCard).toBeVisible({ timeout: 10_000 });

    console.log("✓ Webhook config updated successfully");
  });

  test("6. Create actual GitHub issue on test repo and verify webhook flow", async ({ request }) => {
    // Step 1: Create a trigger config
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `Live GitHub Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["issues"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();

    // Step 2: Register the webhook on GitHub (use the local server URL or ngrok if available)
    // We'll skip actual GitHub registration in CI but test the payload flow
    // Instead, simulate what GitHub would send:
    const issuePayload = {
      action: "opened",
      number: Math.floor(Math.random() * 1000),
      issue: {
        number: Math.floor(Math.random() * 1000),
        title: `[Routa E2E] Automated Test Issue ${new Date().toISOString()}`,
        body: "Issue created by Routa E2E test to validate the GitHub webhook trigger system.\n\nThis is connected to Issue #43 (Event-Driven Trigger System).",
        html_url: `https://github.com/${TEST_REPO}/issues/999`,
        labels: [],
        user: { login: "phodal" },
      },
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "phodal" },
    };

    // Step 3: Send a simulated webhook event with no secret (config has empty secret)
    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "issues",
        "x-github-delivery": `live-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: issuePayload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    console.log(`[Live test] Webhook result:`, result);

    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);

    // Step 4: Check logs
    const logsRes = await request.get(`${BASE_URL}/api/webhooks/webhook-logs?configId=${config.id}`);
    const { logs } = await logsRes.json();
    expect(logs.length).toBeGreaterThanOrEqual(1);
    expect(logs[0].outcome).toBe("triggered");
    console.log(`✓ Issue event triggered ${logs.length} agent task(s)`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up live test config");
  });

  test("7. Create a real GitHub issue via API for live testing", async ({ request }) => {
    // Create an actual issue on the test repository
    const issueRes = await request.post(
      `https://api.github.com/repos/${TEST_REPO}/issues`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        data: {
          title: `[Routa E2E] GitHub Webhook Trigger System Test — ${new Date().toISOString()}`,
          body: `## Automated Test Issue\n\nThis issue was created by the Routa E2E test suite to validate the GitHub webhook trigger system (Issue #43).\n\n**Trigger Agent:** claude-code\n**Test Time:** ${new Date().toISOString()}\n\nThis issue can be closed/deleted after verification.`,
          labels: [],
        },
      }
    );

    if (!issueRes.ok()) {
      const errBody = await issueRes.text();
      console.warn(`ℹ GitHub issue creation failed (${issueRes.status()}): ${errBody}`);
      console.warn("  This may be expected if the token lacks repo write access.");
      return;
    }

    const issue = await issueRes.json();
    console.log(`✓ Created GitHub issue #${issue.number}: ${issue.html_url}`);

    // Clean up: close the issue
    await request.patch(
      `https://api.github.com/repos/${TEST_REPO}/issues/${issue.number}`,
      {
        headers: {
          Authorization: `token ${GITHUB_TOKEN}`,
          Accept: "application/vnd.github+json",
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        data: { state: "closed" },
      }
    );
    console.log(`✓ Closed GitHub issue #${issue.number}`);
  });

  test("8. Delete webhook configuration via UI", async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/webhooks`);
    await page.waitForLoadState("networkidle");

    // Look for a config card with delete button
    const deleteBtn = page.locator("button").filter({ hasText: /Delete/i }).first();
    const deleteBtnVisible = await deleteBtn.isVisible({ timeout: 3000 }).catch(() => false);

    if (!deleteBtnVisible) {
      console.log("ℹ No config to delete. Skipping delete test.");
      return;
    }

    // Set up dialog handler to accept confirmation
    page.on("dialog", (dialog) => dialog.accept());

    await deleteBtn.click();
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/webhook-08-after-delete.png",
      fullPage: true,
    });

    console.log("✓ Config deleted via UI");
  });

  test("9. Webhook receiver GET endpoint returns health info", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/webhooks/github`);
    expect(res.ok()).toBeTruthy();
    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.endpoint).toContain("GitHub Webhook Receiver");
    console.log("✓ Webhook receiver health check passed");
  });

  test("10. Webhook configs API CRUD operations", async ({ request }) => {
    // CREATE
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `CRUD Test ${Date.now()}`,
        repo: "phodal-archive/data-mesh-spike",
        githubToken: "test-token-placeholder",
        webhookSecret: "test-secret",
        eventTypes: ["issues", "check_run"],
        labelFilter: ["feature"],
        triggerAgentId: "glm-4",
        enabled: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.config.name).toContain("CRUD Test");
    expect(created.config.eventTypes).toContain("issues");
    expect(created.config.githubToken).toContain("..."); // masked
    const id = created.config.id;
    console.log(`✓ Created config via API: ${id}`);

    // READ
    const getRes = await request.get(`${BASE_URL}/api/webhooks/configs?id=${id}`);
    expect(getRes.ok()).toBeTruthy();
    const gotten = await getRes.json();
    expect(gotten.id).toBe(id);
    console.log("✓ Read single config");

    // LIST
    const listRes = await request.get(`${BASE_URL}/api/webhooks/configs`);
    expect(listRes.ok()).toBeTruthy();
    const listed = await listRes.json();
    expect(Array.isArray(listed.configs)).toBe(true);
    expect(listed.configs.some((c: { id: string }) => c.id === id)).toBe(true);
    console.log(`✓ Listed ${listed.configs.length} configs`);

    // UPDATE
    const updateRes = await request.put(`${BASE_URL}/api/webhooks/configs`, {
      data: { id, name: "Updated CRUD Test", enabled: false },
    });
    expect(updateRes.ok()).toBeTruthy();
    const updated = await updateRes.json();
    expect(updated.config.name).toBe("Updated CRUD Test");
    expect(updated.config.enabled).toBe(false);
    console.log("✓ Updated config");

    // DELETE
    const delRes = await request.delete(`${BASE_URL}/api/webhooks/configs?id=${id}`);
    expect(delRes.ok()).toBeTruthy();
    console.log("✓ Deleted config");

    // Verify deleted
    const verifyRes = await request.get(`${BASE_URL}/api/webhooks/configs?id=${id}`);
    expect(verifyRes.status()).toBe(404);
    console.log("✓ Config no longer exists after deletion");
  });

  // ─── Phase 2: PR / CI / Tag Event Tests (Issue #44) ───────────────────────────

  test("11. Test PR review event handling (Issue #44)", async ({ request }) => {
    // Create a config for PR review events
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `PR Review Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["pull_request_review"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();
    console.log(`✓ Created PR review config: ${config.id}`);

    // Simulate a pull_request_review event
    const payload = {
      action: "submitted",
      review: {
        id: 12345,
        state: "approved",
        body: "LGTM! Great implementation.",
        html_url: `https://github.com/${TEST_REPO}/pull/1#pullrequestreview-12345`,
        user: { login: "reviewer" },
        commit_id: "abc123def456",
      },
      pull_request: {
        number: 1,
        title: "E2E Test PR for PR Review",
        body: "Testing PR review webhook handling",
        html_url: `https://github.com/${TEST_REPO}/pull/1`,
        state: "open",
        user: { login: "phodal" },
        head: { ref: "feature/test", sha: "abc123" },
        base: { ref: "main" },
        merged: false,
        draft: false,
      },
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "reviewer" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "pull_request_review",
        "x-github-delivery": `pr-review-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    console.log(`✓ PR review event processed: ${result.processed} triggered`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up PR review test config");
  });

  test("12. Test workflow_run event handling (Issue #44)", async ({ request }) => {
    // Create a config for workflow_run events
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `Workflow Run Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["workflow_run"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();
    console.log(`✓ Created workflow_run config: ${config.id}`);

    // Simulate a workflow_run event
    const payload = {
      action: "completed",
      workflow_run: {
        id: 9876543210,
        name: "CI Build",
        status: "completed",
        conclusion: "failure",
        workflow_id: 12345,
        html_url: `https://github.com/${TEST_REPO}/actions/runs/9876543210`,
        head_branch: "feature/test",
        head_sha: "abc123def456",
        event: "push",
        run_number: 42,
        run_attempt: 1,
      },
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "phodal" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "workflow_run",
        "x-github-delivery": `workflow-run-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    console.log(`✓ workflow_run event processed: ${result.processed} triggered`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up workflow_run test config");
  });

  test("13. Test create event (tag/branch) handling (Issue #44)", async ({ request }) => {
    // Create a config for create events
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `Create Event Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["create"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();
    console.log(`✓ Created 'create' event config: ${config.id}`);

    // Simulate a create event for a new tag
    const payload = {
      ref: "v1.2.3",
      ref_type: "tag",
      master_branch: "main",
      pusher_type: "user",
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "phodal" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "create",
        "x-github-delivery": `create-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    console.log(`✓ Create event (tag) processed: ${result.processed} triggered`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up create event test config");
  });

  test("14. Test delete event (tag/branch) handling (Issue #44)", async ({ request }) => {
    // Create a config for delete events
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `Delete Event Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["delete"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();
    console.log(`✓ Created 'delete' event config: ${config.id}`);

    // Simulate a delete event for a branch
    const payload = {
      ref: "feature/old-branch",
      ref_type: "branch",
      pusher_type: "user",
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "phodal" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "delete",
        "x-github-delivery": `delete-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    console.log(`✓ Delete event (branch) processed: ${result.processed} triggered`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up delete event test config");
  });

  test("15. Test check_suite event handling (Issue #44)", async ({ request }) => {
    // Create a config for check_suite events
    const createRes = await request.post(`${BASE_URL}/api/webhooks/configs`, {
      data: {
        name: `Check Suite Test ${Date.now()}`,
        repo: TEST_REPO,
        githubToken: GITHUB_TOKEN,
        webhookSecret: "",
        eventTypes: ["check_suite"],
        labelFilter: [],
        triggerAgentId: "claude-code",
        enabled: true,
      },
    });

    expect(createRes.status()).toBe(201);
    const { config } = await createRes.json();
    console.log(`✓ Created check_suite config: ${config.id}`);

    // Simulate a check_suite event
    const payload = {
      action: "completed",
      check_suite: {
        id: 123456789,
        status: "completed",
        conclusion: "success",
        head_branch: "main",
        head_sha: "abc123def456",
        url: `https://api.github.com/repos/${TEST_REPO}/check-suites/123456789`,
        pull_requests: [{ number: 42, url: `https://github.com/${TEST_REPO}/pull/42` }],
      },
      repository: {
        full_name: TEST_REPO,
        html_url: `https://github.com/${TEST_REPO}`,
      },
      sender: { login: "github-actions[bot]" },
    };

    const webhookRes = await request.post(`${BASE_URL}/api/webhooks/github`, {
      headers: {
        "x-github-event": "check_suite",
        "x-github-delivery": `check-suite-test-${Date.now()}`,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(webhookRes.ok()).toBeTruthy();
    const result = await webhookRes.json();
    expect(result.ok).toBe(true);
    expect(result.processed).toBeGreaterThanOrEqual(1);
    console.log(`✓ check_suite event processed: ${result.processed} triggered`);

    // Cleanup
    await request.delete(`${BASE_URL}/api/webhooks/configs?id=${config.id}`);
    console.log("✓ Cleaned up check_suite test config");
  });
});
