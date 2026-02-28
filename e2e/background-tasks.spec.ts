import { test, expect } from "@playwright/test";

/**
 * Background Task Queue — E2E Tests
 *
 * Covers:
 *  1. Workspace page shows "Background Tasks" tab
 *  2. Tab renders empty-state when no tasks exist
 *  3. "Dispatch Task" button opens modal
 *  4. Filling & submitting the modal creates a task visible in the list
 *  5. REST API: POST /api/background-tasks returns 201 with PENDING task
 *  6. REST API: GET /api/background-tasks/:id returns the task
 *  7. REST API: DELETE /api/background-tasks/:id cancels the task
 */

const BASE_URL = "http://localhost:3000";
const WORKSPACE_URL = `${BASE_URL}/workspace/default`;

test.describe("Background Task Queue", () => {
  test.setTimeout(30_000);

  // ── UI: tab visibility ───────────────────────────────────────────────────

  test("workspace shows Background Tasks tab", async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    await expect(
      page.getByRole("button", { name: /background tasks/i })
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Background Tasks tab shows empty state when no tasks", async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    await page.getByRole("button", { name: /background tasks/i }).click();
    // Either empty state text or a task list should be present
    const emptyOrList = page.locator('[data-testid="bg-task-item"], text=/No background tasks yet/i');
    await expect(emptyOrList.first()).toBeVisible({ timeout: 8_000 });
  });

  // ── UI: dispatch modal ───────────────────────────────────────────────────

  test("Dispatch Task button opens modal", async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    await page.getByRole("button", { name: /background tasks/i }).click();
    await page.locator('[data-testid="dispatch-task-btn"]').click();

    await expect(page.getByPlaceholder(/enter the task prompt/i)).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('[data-testid="dispatch-agent-input"]')).toBeVisible();
    await expect(page.locator('[data-testid="dispatch-submit-btn"]')).toBeVisible();
  });

  test("dispatching a task adds it to the task list", async ({ page }) => {
    await page.goto(WORKSPACE_URL);
    await page.getByRole("button", { name: /background tasks/i }).click();
    await page.locator('[data-testid="dispatch-task-btn"]').click();

    await page.locator('[data-testid="dispatch-prompt-input"]').fill("Run a health check on the workspace");
    await page.locator('[data-testid="dispatch-agent-input"]').fill("opencode");

    await page.locator('[data-testid="dispatch-submit-btn"]').click();

    // Modal should close and task should appear
    await expect(page.locator('[data-testid="dispatch-prompt-input"]')).not.toBeVisible({ timeout: 5_000 });
    const taskItem = page.locator('[data-testid="bg-task-item"]').first();
    await expect(taskItem).toBeVisible({ timeout: 8_000 });

    const statusBadge = page.locator('[data-testid="bg-task-status"]').first();
    await expect(statusBadge).toBeVisible();
    const statusText = await statusBadge.textContent();
    expect(["PENDING", "RUNNING", "COMPLETED", "FAILED"]).toContain(statusText?.trim());
  });

  // ── API: background-tasks REST endpoints ─────────────────────────────────

  test("POST /api/background-tasks → 201 with PENDING task", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/background-tasks`, {
      data: {
        prompt: "Automated test health check",
        agentId: "opencode",
        workspaceId: "default",
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(body.task).toBeDefined();
    expect(body.task.status).toBe("PENDING");
    expect(body.task.agentId).toBe("opencode");
    expect(body.task.workspaceId).toBe("default");
  });

  test("POST /api/background-tasks → 400 when prompt missing", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/background-tasks`, {
      data: { agentId: "opencode" },
    });
    expect(res.status()).toBe(400);
  });

  test("GET /api/background-tasks/:id → returns task after creation", async ({ request }) => {
    // Create a task first
    const createRes = await request.post(`${BASE_URL}/api/background-tasks`, {
      data: { prompt: "Test task for GET", agentId: "opencode", workspaceId: "default" },
    });
    const { task } = await createRes.json();
    const id = task.id;

    // Fetch by ID
    const getRes = await request.get(`${BASE_URL}/api/background-tasks/${id}`);
    expect(getRes.status()).toBe(200);
    const body = await getRes.json();
    expect(body.task.id).toBe(id);
    expect(body.task.prompt).toBe("Test task for GET");
  });

  test("GET /api/background-tasks/:id → 404 for unknown id", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/background-tasks/nonexistent-id`);
    expect(res.status()).toBe(404);
  });

  test("DELETE /api/background-tasks/:id → cancels a PENDING task", async ({ request }) => {
    // Create a task
    const createRes = await request.post(`${BASE_URL}/api/background-tasks`, {
      data: { prompt: "Task to cancel", agentId: "opencode", workspaceId: "default" },
    });
    const { task } = await createRes.json();
    const id = task.id;

    // Cancel it
    const delRes = await request.delete(`${BASE_URL}/api/background-tasks/${id}`);
    expect(delRes.status()).toBe(200);
    const body = await delRes.json();
    expect(body.task.status).toBe("CANCELLED");
  });

  test("GET /api/background-tasks returns list for workspace", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/background-tasks?workspaceId=default`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.tasks)).toBe(true);
  });
});
