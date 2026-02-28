import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3000";

test.describe("A2A Protocol API", () => {
  test("agent card discovery endpoint returns valid AgentCard", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/.well-known/agent-card.json`);
    expect(res.status()).toBe(200);

    const card = await res.json();
    expect(card).toMatchObject({
      name: expect.any(String),
      version: expect.any(String),
      skills: expect.arrayContaining([
        expect.objectContaining({ id: expect.any(String), name: expect.any(String) }),
      ]),
    });
  });

  test("JSON-RPC method_list returns A2A spec methods", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: { jsonrpc: "2.0", id: 1, method: "method_list", params: {} },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.jsonrpc).toBe("2.0");
    expect(body.result?.methods).toEqual(
      expect.arrayContaining(["SendMessage", "GetTask", "ListTasks", "CancelTask"])
    );
  });

  test("ListTasks returns empty array when no tasks exist", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 2,
        method: "ListTasks",
        params: {},
      },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.result?.tasks).toBeInstanceOf(Array);
  });

  test("SendMessage creates a task and returns task object", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 3,
        method: "SendMessage",
        params: {
          message: {
            messageId: "test-msg-001",
            role: "user",
            parts: [{ text: "Build a REST API for user management" }],
          },
          metadata: {},
        },
      },
    });
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.result?.task).toBeDefined();
    const task = body.result.task;
    expect(task.id).toBeTruthy();
    expect(task.status?.state).toMatch(/submitted|working/);
    expect(task.metadata?.userPrompt).toContain("REST API");
  });

  test("GetTask retrieves the created task by ID", async ({ request }) => {
    // First create a task
    const sendRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 4,
        method: "SendMessage",
        params: {
          message: {
            messageId: "test-msg-002",
            role: "user",
            parts: [{ text: "Add authentication middleware" }],
          },
          metadata: {},
        },
      },
    });
    const sendBody = await sendRes.json();
    const taskId: string = sendBody.result?.task?.id;
    expect(taskId).toBeTruthy();

    // Now get the task
    const getRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 5,
        method: "GetTask",
        params: { id: taskId },
      },
    });
    expect(getRes.status()).toBe(200);
    const getBody = await getRes.json();
    expect(getBody.result?.task?.id).toBe(taskId);
  });

  test("GetTask returns error for unknown task ID", async ({ request }) => {
    const res = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 6,
        method: "GetTask",
        params: { id: "non-existent-task-id" },
      },
    });
    const body = await res.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe(-32001);
  });

  test("CancelTask cancels an existing task", async ({ request }) => {
    // Create a task first
    const sendRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 7,
        method: "SendMessage",
        params: {
          message: {
            messageId: "test-msg-003",
            role: "user",
            parts: [{ text: "Write unit tests for the API" }],
          },
          metadata: {},
        },
      },
    });
    const taskId: string = (await sendRes.json()).result?.task?.id;
    expect(taskId).toBeTruthy();

    // Cancel it
    const cancelRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 8,
        method: "CancelTask",
        params: { id: taskId },
      },
    });
    expect(cancelRes.status()).toBe(200);
    const cancelBody = await cancelRes.json();
    expect(cancelBody.result?.task?.status?.state).toBe("canceled");
  });

  test("REST GET /api/a2a/tasks returns task list", async ({ request }) => {
    const res = await request.get(`${BASE_URL}/api/a2a/tasks`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.tasks).toBeInstanceOf(Array);
  });

  test("REST GET /api/a2a/tasks/[id] returns specific task", async ({ request }) => {
    // Create a task via RPC first
    const rpcRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 9,
        method: "SendMessage",
        params: {
          message: {
            messageId: "test-msg-004",
            role: "user",
            parts: [{ text: "Deploy to production" }],
          },
          metadata: {},
        },
      },
    });
    const taskId: string = (await rpcRes.json()).result?.task?.id;

    // Fetch via REST
    const res = await request.get(`${BASE_URL}/api/a2a/tasks/${taskId}`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.task?.id).toBe(taskId);
  });
});

test.describe("A2A Page UI", () => {
  test("A2A page loads and shows AgentCard info", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);

    // Header should show A2A branding
    await expect(page.locator("h1")).toContainText(/A2A|Agent|Routa/i);

    // Should show "Live" indicator
    await expect(page.getByText("Live")).toBeVisible({ timeout: 10_000 });
  });

  test("A2A page shows Agent Card tab with skills", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);

    // Click Skills tab
    await page.getByRole("button", { name: /skills/i }).click();
    await expect(page.getByText("agent-coordination")).toBeVisible({ timeout: 5_000 });
  });

  test("A2A page Send Message form creates a task", async ({ page }) => {
    await page.goto(`${BASE_URL}/a2a`);

    // Fill in the prompt
    const textarea = page.getByPlaceholder(/Describe what you need/i);
    await textarea.fill("Build a REST API for user management");

    // Submit
    await page.getByRole("button", { name: /Send/i }).click();

    // Task should appear in list
    await expect(page.getByText(/submitted|working|completed/i)).toBeVisible({
      timeout: 10_000,
    });
  });
});

test.describe("A2A End-to-End: Homepage → Agent → API", () => {
  test("creates task via A2A API after workspace interaction", async ({ page, request }) => {
    test.setTimeout(60_000);

    // Step 1: visit homepage
    await page.goto(BASE_URL);

    // Step 2: send message via A2A SendMessage with a unique prompt
    const uniquePrompt = `E2E test: Build notification service ${Date.now()}`;
    const rpcRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 10,
        method: "SendMessage",
        params: {
          message: {
            messageId: `e2e-${Date.now()}`,
            role: "user",
            parts: [{ text: uniquePrompt }],
          },
          metadata: {},
        },
      },
    });
    expect(rpcRes.status()).toBe(200);

    const rpcBody = await rpcRes.json();
    expect(rpcBody.result?.task).toBeDefined();
    const taskId: string = rpcBody.result.task.id;

    // Step 3: verify task appears in ListTasks
    const listRes = await request.post(`${BASE_URL}/api/a2a/rpc`, {
      data: {
        jsonrpc: "2.0",
        id: 11,
        method: "ListTasks",
        params: {},
      },
    });
    const listBody = await listRes.json();
    const found = (listBody.result?.tasks as Array<{ id: string }> | undefined)?.some(
      (t) => t.id === taskId
    );
    expect(found).toBe(true);

    // Step 4: verify task shows on A2A page
    await page.goto(`${BASE_URL}/a2a`);
    await page.waitForTimeout(1000); // let auto-refresh run

    // Refresh tasks
    await page.getByRole("button", { name: "Refresh" }).click();

    // The task ID prefix should appear somewhere
    await expect(page.getByText(taskId.slice(0, 8))).toBeVisible({ timeout: 10_000 });
  });
});
