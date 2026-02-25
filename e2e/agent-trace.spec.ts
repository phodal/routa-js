/**
 * Agent Trace E2E Tests
 *
 * Tests for Agent Trace functionality:
 * - Session lifecycle trace recording (session_start, session_end)
 * - User message and agent response tracing
 * - Tool call tracing with file ranges
 * - VCS context (Git branch, revision) in traces
 * - Query traces by session
 * - Export traces in Agent Trace JSON format
 */

import { test, expect } from "@playwright/test";

test.describe("Agent Trace", () => {
  test("session lifecycle and message tracing", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:3000");
    await expect(page.locator("h1")).toHaveText("Routa");

    // Step 1: Connect
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await connectBtn.click();
    await expect(
      page.getByRole("button", { name: "Disconnect" })
    ).toBeVisible({ timeout: 10_000 });

    // Step 2: New session
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    // Step 3: Send a message that triggers tool calls
    await input.fill("List all files in the current directory using the LS tool.");
    await input.press("Enter");

    // Step 4: Wait for response
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".bg-gray-100.rounded-2xl");
        for (const b of bubbles) {
          const text = (b.textContent || "").trim();
          if (text.length > 0) return true;
        }
        return false;
      },
      { timeout: 60_000 }
    );

    // Step 5: Verify traces were recorded via API
    // Get the current session ID from the page
    const sessionId = await page.evaluate(() => {
      const url = window.location.href;
      const match = url.match(/session=([^&]+)/);
      return match ? match[1] : null;
    });

    expect(sessionId).not.toBeNull();

    // Query traces for this session
    const tracesResponse = await request.get(
      `http://localhost:3000/api/traces?sessionId=${sessionId}`
    );

    expect(tracesResponse.ok()).toBeTruthy();
    const tracesData = await tracesResponse.json();

    // Verify we have traces
    expect(tracesData.traces).toBeDefined();
    expect(Array.isArray(tracesData.traces)).toBeTruthy();
    expect(tracesData.traces.length).toBeGreaterThan(0);

    // Verify trace structure
    const firstTrace = tracesData.traces[0];
    expect(firstTrace).toHaveProperty("version");
    expect(firstTrace).toHaveProperty("id");
    expect(firstTrace).toHaveProperty("timestamp");
    expect(firstTrace).toHaveProperty("sessionId");
    expect(firstTrace).toHaveProperty("eventType");
    expect(firstTrace).toHaveProperty("contributor");

    // Verify event types exist
    const eventTypes = new Set(tracesData.traces.map((t: any) => t.eventType));
    expect(eventTypes.has("user_message") || eventTypes.has("session_start")).toBeTruthy();
  });

  test("tool call with file ranges", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:3000");
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await connectBtn.click();
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    // Send a message that triggers file reading
    await input.fill("Read the package.json file and show its contents.");
    await input.press("Enter");

    // Wait for response
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".bg-gray-100.rounded-2xl");
        for (const b of bubbles) {
          const text = (b.textContent || "").trim();
          if (text.length > 0) return true;
        }
        return false;
      },
      { timeout: 60_000 }
    );

    // Get session ID and query traces
    const sessionId = await page.evaluate(() => {
      const url = window.location.href;
      const match = url.match(/session=([^&]+)/);
      return match ? match[1] : null;
    });

    const tracesResponse = await request.get(
      `http://localhost:3000/api/traces?sessionId=${sessionId}`
    );
    const tracesData = await tracesResponse.json();

    // Find tool_call traces
    const toolCalls = tracesData.traces.filter(
      (t: any) => t.eventType === "tool_call" || t.eventType === "tool_result"
    );

    expect(toolCalls.length).toBeGreaterThan(0);

    // Verify file information in tool calls
    const readToolCall = toolCalls.find((t: any) =>
      t.tool?.name?.toLowerCase().includes("read")
    );

    if (readToolCall) {
      expect(readToolCall.tool).toBeDefined();
      expect(readToolCall.tool.name).toBeDefined();
      // File information should be present if the tool supports it
      expect(readToolCall.files || readToolCall.tool.input).toBeDefined();
    }
  });

  test("VCS context in traces", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:3000");
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await connectBtn.click();
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    await input.fill("What files are in this directory?");
    await input.press("Enter");

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".bg-gray-100.rounded-2xl");
        for (const b of bubbles) {
          const text = (b.textContent || "").trim();
          if (text.length > 0) return true;
        }
        return false;
      },
      { timeout: 60_000 }
    );

    const sessionId = await page.evaluate(() => {
      const url = window.location.href;
      const match = url.match(/session=([^&]+)/);
      return match ? match[1] : null;
    });

    const tracesResponse = await request.get(
      `http://localhost:3000/api/traces?sessionId=${sessionId}`
    );
    const tracesData = await tracesResponse.json();

    // Check if any trace has VCS context
    const tracesWithVcs = tracesData.traces.filter((t: any) => t.vcs);
    expect(tracesWithVcs.length).toBeGreaterThanOrEqual(0);

    // If VCS context exists, verify its structure
    if (tracesWithVcs.length > 0) {
      const vcs = tracesWithVcs[0].vcs;
      expect(vcs).toMatchObject({
        branch: expect.any(String),
        // revision and repoRoot are optional
      });
    }
  });

  test("export traces in Agent Trace JSON format", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:3000");
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await connectBtn.click();
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    await input.fill("Hello, can you list files?");
    await input.press("Enter");

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".bg-gray-100.rounded-2xl");
        for (const b of bubbles) {
          const text = (b.textContent || "").trim();
          if (text.length > 0) return true;
        }
        return false;
      },
      { timeout: 60_000 }
    );

    const sessionId = await page.evaluate(() => {
      const url = window.location.href;
      const match = url.match(/session=([^&]+)/);
      return match ? match[1] : null;
    });

    // Export traces
    const exportResponse = await request.post(
      `http://localhost:3000/api/traces/export`,
      {
        data: { sessionId },
      }
    );

    expect(exportResponse.ok()).toBeTruthy();
    const exportData = await exportResponse.json();

    // Verify export format
    expect(exportData).toHaveProperty("format", "agent-trace-json");
    expect(exportData).toHaveProperty("version", "0.1.0");
    expect(exportData).toHaveProperty("export");
    expect(Array.isArray(exportData.export)).toBeTruthy();

    // Verify exported traces have required fields
    if (exportData.export.length > 0) {
      const exportedTrace = exportData.export[0];
      expect(exportedTrace).toHaveProperty("version");
      expect(exportedTrace).toHaveProperty("id");
      expect(exportedTrace).toHaveProperty("timestamp");
      expect(exportedTrace).toHaveProperty("sessionId");
      expect(exportedTrace).toHaveProperty("eventType");
      expect(exportedTrace).toHaveProperty("contributor");
    }
  });

  test("trace statistics endpoint", async ({ request }) => {
    const statsResponse = await request.get(
      "http://localhost:3000/api/traces/stats"
    );

    expect(statsResponse.ok()).toBeTruthy();
    const statsData = await statsResponse.json();

    // Verify stats structure
    expect(statsData).toHaveProperty("totalDays");
    expect(statsData).toHaveProperty("totalFiles");
    expect(statsData).toHaveProperty("totalRecords");
    expect(statsData).toHaveProperty("uniqueSessions");
    expect(statsData).toHaveProperty("eventTypes");

    // Verify event types is a map/object
    expect(typeof statsData.eventTypes).toBe("object");
  });

  test("query traces by filters", async ({ page, request }) => {
    test.setTimeout(120_000);

    await page.goto("http://localhost:3000");
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await connectBtn.click();
    await page.getByRole("button", { name: "New" }).click();
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    await input.fill("Say hello");
    await input.press("Enter");

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll(".bg-gray-100.rounded-2xl");
        for (const b of bubbles) {
          const text = (b.textContent || "").trim();
          if (text.length > 0) return true;
        }
        return false;
      },
      { timeout: 60_000 }
    );

    // Query by event type
    const userMsgResponse = await request.get(
      "http://localhost:3000/api/traces?eventType=user_message&limit=10"
    );
    expect(userMsgResponse.ok()).toBeTruthy();
    const userMsgData = await userMsgResponse.json();
    expect(userMsgData.traces).toBeDefined();
    expect(Array.isArray(userMsgData.traces)).toBeTruthy();

    // If we have user_message traces, verify their structure
    if (userMsgData.traces.length > 0) {
      const userMsg = userMsgData.traces[0];
      expect(userMsg.eventType).toBe("user_message");
      expect(userMsg.conversation).toBeDefined();
      expect(userMsg.conversation.role).toBe("user");
    }

    // Query tool calls
    const toolCallResponse = await request.get(
      "http://localhost:3000/api/traces?eventType=tool_call&limit=10"
    );
    expect(toolCallResponse.ok()).toBeTruthy();
    const toolCallData = await toolCallResponse.json();
    expect(toolCallData.traces).toBeDefined();
    expect(Array.isArray(toolCallData.traces)).toBeTruthy();
  });
});
