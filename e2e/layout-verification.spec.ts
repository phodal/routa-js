import { test, expect } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

/**
 * Home layout verification at 1920x1080 viewport.
 * Verifies the current home chrome, hero composer, and primary CTA flow.
 */
test.describe("Layout Verification", () => {
  test.setTimeout(30_000);

  test("home layout at 1920x1080 - header, hero, composer, primary actions", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto(BASE_URL);
    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(1500);

    await page.screenshot({
      path: "test-results/layout-1920x1080.png",
      fullPage: false,
    });

    const header = page.locator("header");
    await expect(header).toBeVisible();
    await expect(header.getByText("Routa")).toBeVisible();
    await expect(header.getByText("Kanban-First Control Surface")).toBeVisible();

    const heroHeading = page.getByRole("heading", { name: "Start with a requirement." });
    await expect(heroHeading).toBeVisible();
    await expect(page.getByText("Composer")).toBeVisible();

    const main = page.locator("main");
    await expect(main).toBeVisible();

    await expect(page.getByRole("link", { name: "Workspace overview" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Kanban" })).toBeVisible();
    await expect(header.getByRole("link", { name: "Kanban" })).toBeVisible();

    await page.screenshot({
      path: "test-results/layout-1920x1080-home-verified.png",
      fullPage: false,
    });
  });
});
