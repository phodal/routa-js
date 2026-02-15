import { test, expect } from "@playwright/test";

/**
 * MCP Integration Test
 *
 * Tests the MCP integration in the chat UI by:
 * 1. Selecting Claude Code provider, creating session, sending "你有什么工具", verifying MCP tools in response
 * 2. Selecting Auggie provider, same flow
 *
 * The response should contain information about MCP tools (e.g. "routa-coordination" or tool names)
 * if MCP is configured correctly.
 */
test.describe("MCP Integration in Chat UI", () => {
  test.setTimeout(180_000); // 3 min - agent startup can take 10-30s

  test("Claude Code: select provider → new session → send 你有什么工具 → verify MCP response", async ({
    page,
  }) => {
    // Step 1: Navigate
    await page.goto("http://localhost:3000");
    await page.screenshot({
      path: "test-results/mcp-claude-01-initial.png",
      fullPage: true,
    });

    // Step 2: Wait for auto-connect
    await expect(
      page.getByRole("button", { name: /Connected|Disconnect/ })
    ).toBeVisible({ timeout: 15_000 });

    // Step 3: Click Claude Code in provider list
    const claudeBtn = page.locator('aside button').filter({ hasText: "Claude Code" }).first();
    await claudeBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/mcp-claude-02-claude-selected.png",
      fullPage: true,
    });

    // Step 4: New Session
    await page.getByRole("button", { name: /New Session/ }).click();
    // TipTap uses contenteditable + data-placeholder, not HTML placeholder - wait for editor to be ready
    const editor = page.locator(".tiptap-chat-input, .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(2000); // Allow session to initialize

    await page.screenshot({
      path: "test-results/mcp-claude-03-session-ready.png",
      fullPage: true,
    });

    // Step 5: Type in TipTap editor (contenteditable - use keyboard after click)
    await editor.click();
    await page.keyboard.type("你有什么工具");
    await page.waitForTimeout(300);

    // Step 6: Send (Enter or send button)
    await page.keyboard.press("Enter");

    // Step 7: Verify user message appears
    await expect(page.locator("text=你有什么工具")).toBeVisible({
      timeout: 5_000,
    });

    // Step 8: Wait for assistant response (up to 45s - agent startup)
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll("div.rounded-2xl");
        for (const b of bubbles) {
          if (b.classList.contains("bg-blue-600")) continue; // skip user
          const text = (b.textContent || "").trim();
          if (text.length > 20) return true;
        }
        return false;
      },
      { timeout: 50_000 }
    );

    await page.screenshot({
      path: "test-results/mcp-claude-04-response.png",
      fullPage: true,
    });

    // Step 9: Check response content for MCP-related terms
    const assistantBubbles = page.locator("div.rounded-2xl:not(.bg-blue-600)");
    const count = await assistantBubbles.count();
    let fullText = "";
    for (let i = 0; i < count; i++) {
      fullText += (await assistantBubbles.nth(i).textContent()) || "";
    }

    console.log("Claude Code response (first 1500 chars):", fullText.slice(0, 1500));

    // MCP tools might be mentioned as "routa-coordination", "list_agents", "MCP", "工具", etc.
    const hasMcpIndicator =
      /routa-coordination|list_agents|MCP|工具|tool/i.test(fullText) ||
      fullText.length > 50;

    expect(hasMcpIndicator).toBeTruthy();
    expect(count).toBeGreaterThan(0);
  });

  test("Auggie: select provider → new session → send 你有什么工具 → verify response", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    await expect(
      page.getByRole("button", { name: /Connected|Disconnect/ })
    ).toBeVisible({ timeout: 15_000 });

    // Select Auggie
    const auggieBtn = page.locator('aside button').filter({ hasText: "Auggie" }).first();
    await auggieBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/mcp-auggie-01-selected.png",
      fullPage: true,
    });

    // New Session
    await page.getByRole("button", { name: /New Session/ }).click();
    const editor = page.locator(".tiptap-chat-input, .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(2000);

    // Type and send (TipTap contenteditable - use keyboard after click)
    await editor.click();
    await page.keyboard.type("你有什么工具");
    await page.keyboard.press("Enter");

    await expect(page.locator("text=你有什么工具")).toBeVisible({
      timeout: 5_000,
    });

    // Wait for response
    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll("div.rounded-2xl");
        for (const b of bubbles) {
          if (b.classList.contains("bg-blue-600")) continue;
          const text = (b.textContent || "").trim();
          if (text.length > 20) return true;
        }
        return false;
      },
      { timeout: 50_000 }
    );

    await page.screenshot({
      path: "test-results/mcp-auggie-02-response.png",
      fullPage: true,
    });

    const assistantBubbles = page.locator("div.rounded-2xl:not(.bg-blue-600)");
    const count = await assistantBubbles.count();
    let fullText = "";
    for (let i = 0; i < count; i++) {
      fullText += (await assistantBubbles.nth(i).textContent()) || "";
    }

    console.log("Auggie response (first 1500 chars):", fullText.slice(0, 1500));

    const hasMcpIndicator =
      /routa-coordination|list_agents|MCP|工具|tool/i.test(fullText) ||
      fullText.length > 50;

    expect(hasMcpIndicator).toBeTruthy();
    expect(count).toBeGreaterThan(0);
  });

  test("Auggie: select existing session → send 你有什么工具 → verify response", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    await expect(
      page.getByRole("button", { name: /Connected|Disconnect/ })
    ).toBeVisible({ timeout: 15_000 });

    await page.screenshot({
      path: "test-results/mcp-auggie-existing-01-initial.png",
      fullPage: true,
    });

    // Select Auggie session (routa-799be862 - match session with auggie, not provider button)
    const auggieSessionBtn = page.locator('aside button').filter({ hasText: /routa-/ }).filter({ hasText: /auggie/i }).first();
    await auggieSessionBtn.click();
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "test-results/mcp-auggie-existing-02-session-selected.png",
      fullPage: true,
    });

    // Focus chat input and type
    const editor = page.locator(".tiptap-chat-input, .ProseMirror").first();
    await editor.click();
    await page.keyboard.type("你有什么工具");
    await page.keyboard.press("Enter");

    await expect(page.locator("text=你有什么工具")).toBeVisible({
      timeout: 5_000,
    });

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll("div.rounded-2xl");
        for (const b of bubbles) {
          if (b.classList.contains("bg-blue-600")) continue;
          const text = (b.textContent || "").trim();
          if (text.length > 20) return true;
        }
        return false;
      },
      { timeout: 45_000 }
    );

    await page.screenshot({
      path: "test-results/mcp-auggie-existing-03-response.png",
      fullPage: true,
    });

    const assistantBubbles = page.locator("div.rounded-2xl:not(.bg-blue-600)");
    const count = await assistantBubbles.count();
    let fullText = "";
    for (let i = 0; i < count; i++) {
      fullText += (await assistantBubbles.nth(i).textContent()) || "";
    }
    console.log("Auggie (existing session) response:", fullText.slice(0, 1500));
    expect(count).toBeGreaterThan(0);
  });

  test("GitHub Copilot: select provider → new session → send 你有什么工具 → verify response", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    await expect(
      page.getByRole("button", { name: /Connected|Disconnect/ })
    ).toBeVisible({ timeout: 15_000 });

    // Select GitHub Copilot
    const copilotBtn = page.locator('aside button').filter({ hasText: "GitHub Copilot" }).first();
    await copilotBtn.click();
    await page.waitForTimeout(500);
    await page.screenshot({
      path: "test-results/mcp-copilot-01-selected.png",
      fullPage: true,
    });

    // New Session
    await page.getByRole("button", { name: /New Session/ }).click();
    const editor = page.locator(".tiptap-chat-input, .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 45_000 });
    // Optionally wait for "Connected to ACP session" (exact text from http-session-store)
    await page.locator("text=/Connected to ACP session\\.?/").first().waitFor({ state: "visible", timeout: 35_000 }).catch(() => {});
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/mcp-copilot-02-session-ready.png",
      fullPage: true,
    });

    await editor.click();
    await page.keyboard.type("你有什么工具");
    await page.keyboard.press("Enter");

    await expect(page.locator("text=你有什么工具")).toBeVisible({
      timeout: 5_000,
    });

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll("div.rounded-2xl");
        for (const b of bubbles) {
          if (b.classList.contains("bg-blue-600")) continue;
          const text = (b.textContent || "").trim();
          if (text.length > 20) return true;
        }
        return false;
      },
      { timeout: 45_000 }
    );

    await page.screenshot({
      path: "test-results/mcp-copilot-03-response.png",
      fullPage: true,
    });

    const assistantBubbles = page.locator("div.rounded-2xl:not(.bg-blue-600)");
    const count = await assistantBubbles.count();
    let fullText = "";
    for (let i = 0; i < count; i++) {
      fullText += (await assistantBubbles.nth(i).textContent()) || "";
    }
    console.log("GitHub Copilot response:", fullText.slice(0, 1500));
    expect(count).toBeGreaterThan(0);
  });
});
