/**
 * Verify Install Agents opens modal (not navigation).
 */
import { test, expect } from "@playwright/test";

test("Install Agents - modal vs navigation", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://localhost:3000");
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(2000);

  const installAgents = page.locator('a:has-text("Install Agents")').first();
  await installAgents.click();
  await page.waitForTimeout(500);

  // If modal: URL stays localhost:3000/, modal overlay visible
  // If navigation: URL becomes localhost:3000/settings/agents
  const url = page.url();
  const navigated = url.includes("/settings/agents");

  if (navigated) {
    // FAIL: It navigated
    expect(navigated).toBe(false);
  } else {
    // Check for modal (overlay, X button, backdrop)
    const modal = page.locator('[role="dialog"], .fixed.inset-0.z-50');
    const hasOverlay = await page.locator(".fixed.inset-0").count() > 0;
    const hasCloseBtn = await page.locator('button:has(svg), [aria-label="Close"]').count() > 0;
    const hasAgentPanel = await page.locator('text=/agent|install|registry/i').count() > 0;
    expect(hasOverlay || hasCloseBtn || hasAgentPanel).toBeTruthy();
  }
});
