import { test, expect } from "@playwright/test";

test("Install Agents - modal overlay with backdrop and X", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("http://localhost:3000/?t=popup-check");
  await page.reload();
  await page.waitForTimeout(2000);

  // Click button labeled exactly "Install Agents" (in left sidebar bottom)
  await page.locator('aside button:has-text("Install Agents")').click();
  await page.waitForTimeout(800);

  const url = page.url();
  const navigated = url.includes("/settings/agents");

  if (navigated) {
    throw new Error(`Navigates to: ${url}`);
  }

  await expect(page.locator('button[title="Close"]')).toBeVisible();
  await expect(page.locator("text=ACP Agents").or(page.locator("text=Agent Installation"))).toBeVisible();
});
