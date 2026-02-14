import { test, expect } from "@playwright/test";

/**
 * Test provider list with status, @ provider mention, and bottom toolbar
 */
test.describe("Provider changes", () => {
  test("Test 1: Provider list with status", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForTimeout(5000); // Auto-connect

    // X/Y installed count at top
    const installedCount = page.locator('text=/\\d+\\/\\d+ installed/');
    await expect(installedCount).toBeVisible({ timeout: 5000 });

    // Provider list - rows with status dot, name, command, badge
    const providerRows = page.locator('aside button').filter({ has: page.locator('span.rounded-full') });
    const count = await providerRows.count();
    expect(count).toBeGreaterThan(0);

    // Check for status badges
    const readyBadges = page.locator('text=Ready');
    const notFoundBadges = page.locator('text=Not found');
    const readyCount = await readyBadges.count();
    const notFoundCount = await notFoundBadges.count();

    // Take screenshot
    await page.screenshot({
      path: "test-results/provider-test1-sidebar.png",
      fullPage: true,
    });

    // Log findings
    console.log(`Providers: ${count}, Ready: ${readyCount}, Not found: ${notFoundCount}`);
  });

  test("Test 2: @ provider mention", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForTimeout(5000);

    const editor = page.locator(".tiptap-chat-input, .ProseMirror").first();
    await editor.click();
    await page.keyboard.type("@");
    await page.waitForTimeout(500);

    const popup = page.locator(".suggestion-popup");
    await expect(popup).toBeVisible({ timeout: 3000 });

    await page.screenshot({
      path: "test-results/provider-test2-at-dropdown.png",
      fullPage: true,
    });

    // Should show providers (OpenCode, Gemini, etc.) not agents (CRAFTER/ROUTA/GATE)
    const popupText = await popup.textContent();
    const hasProvider = popupText?.includes("OpenCode") || popupText?.includes("Gemini");
    const hasAgent = popupText?.includes("CRAFTER") && popupText?.includes("ROUTA");
    expect(hasProvider).toBeTruthy();
    expect(hasAgent).toBeFalsy();

    // Select first available (Enter)
    await page.keyboard.press("Enter");
    await page.waitForTimeout(400);

    const pill = page.locator(".agent-mention");
    await expect(pill).toBeVisible();

    await page.screenshot({
      path: "test-results/provider-test2-pill.png",
      fullPage: true,
    });
  });

  test("Test 3: Bottom toolbar shows @ provider", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForTimeout(3000);

    const toolbar = page.locator('text=@ provider').first();
    await expect(toolbar).toBeVisible();

    await page.screenshot({
      path: "test-results/provider-test3-toolbar.png",
      fullPage: true,
    });
  });
});
