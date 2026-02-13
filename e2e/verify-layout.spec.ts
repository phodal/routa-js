import { test, expect } from "@playwright/test";

/**
 * Verification spec for the main page layout and features.
 * Run with: npx playwright test e2e/verify-layout.spec.ts --project=chromium
 */
test.describe("Page layout and initial state verification", () => {
  test("1. Full-screen layout: top bar + left sidebar + right chat area", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    // Top bar - logo/brand
    await expect(page.locator('text=Routa').first()).toBeVisible();
    // Left sidebar - Provider section
    await expect(page.locator('label:has-text("Provider")')).toBeVisible();
    // Right chat area - input area
    await expect(page.locator('.tiptap-input-wrapper').first()).toBeVisible({ timeout: 5000 });
  });

  test("2. Provider dropdown shows providers (auto-connect on mount)", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    // Wait for auto-connect - providers load after connection
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000); // Allow time for connect + listProviders

    const providerSelect = page.locator('select').filter({ has: page.locator('option') }).first();
    await expect(providerSelect).toBeVisible();

    const options = providerSelect.locator('option');
    const optionTexts = await options.allTextContents();
    const hasProviders = optionTexts.some(
      (t) => t && !t.includes("Connect to load providers")
    );
    expect(hasProviders).toBeTruthy();
  });

  test("3. Tiptap rich text editor in chat input area", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    const tiptapWrapper = page.locator(".tiptap-input-wrapper");
    await expect(tiptapWrapper).toBeVisible({ timeout: 5000 });

    const editor = page.locator(".tiptap-chat-input, [contenteditable=true], .ProseMirror");
    await expect(editor.first()).toBeVisible({ timeout: 5000 });
  });

  test("4. Top bar has Agent selector with CRAFTER selected", async ({
    page,
  }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    await expect(page.locator('text=Agent:')).toBeVisible();
    const agentSelect = page.locator('select').filter({ has: page.locator('option[value="CRAFTER"]') }).first();
    await expect(agentSelect).toBeVisible();
    await expect(agentSelect).toHaveValue("CRAFTER");
  });

  test("5. Initial state screenshot", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    await page.screenshot({
      path: "test-results/verify-initial-state.png",
      fullPage: true,
    });
  });

  test("6. Tiptap editor: click and type text", async ({ page }) => {
    await page.goto("http://localhost:3000");
    await page.waitForLoadState("networkidle");

    const editor = page.locator(".tiptap-chat-input, [contenteditable=true], .ProseMirror").first();
    await expect(editor).toBeVisible({ timeout: 5000 });

    await editor.click();
    await page.keyboard.type("Hello from Playwright verification!");
    await expect(editor).toContainText("Hello from Playwright verification!");

    await page.screenshot({
      path: "test-results/verify-after-typing.png",
      fullPage: true,
    });
  });
});
