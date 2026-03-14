import type { Page } from "@playwright/test";
import { expect, test } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? process.env.ROUTA_TEST_BASE_URL ?? "http://localhost:3000";
const SESSION_URL = `${BASE_URL}/workspace/default/sessions/1eed8a78-7673-4a1b-b6b9-cd68dc5b75c7`;

async function openSession(page: Page, viewport: { width: number; height: number }) {
  await page.addInitScript(() => {
    window.localStorage.setItem("routa.session.left-sidebar-collapsed", "0");
    window.localStorage.setItem("routa.session.crafter-rail-expanded", "0");
  });
  await page.setViewportSize(viewport);
  await page.goto(SESSION_URL);
  await page.waitForLoadState("domcontentloaded");
}

test.describe("Session layout UX", () => {
  test.setTimeout(45_000);

  test("desktop keeps sessions as the primary left-sidebar view", async ({ page }) => {
    await openSession(page, { width: 1440, height: 980 });

    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(page.locator('button:has-text("Sessions")')).toBeVisible();
    await expect(page.locator('button:has-text("Spec")')).toBeVisible();
    await expect(page.locator('button:has-text("Tasks")')).toBeVisible();
    await expect(page.locator("text=Quick Access")).toBeVisible();
    await expect(page.locator("text=Task Snapshot")).toBeVisible();
    await expect(page.locator('button:has-text("Open Tasks")')).toBeVisible();
    await expect(page.getByTestId("session-sidebar-split-handle")).toBeVisible();

    const snapshot = page.getByTestId("session-task-snapshot");
    const totalLabel = await snapshot.locator("text=/\\d+ total/").first().textContent();
    const totalCount = Number(totalLabel?.match(/(\d+)/)?.[1] ?? 0);
    const visibleItems = await page.getByTestId("session-task-snapshot-item").count();
    const quickRunButtons = await page.getByTestId("session-task-quick-run").count();
    const inlineDetails = await page.getByTestId("session-task-snapshot-item").locator("p").count();
    expect(visibleItems).toBe(totalCount);
    expect(quickRunButtons).toBe(totalCount);
    expect(inlineDetails).toBe(0);
  });

  test("mobile opens the session sidebar as a drawer", async ({ page }) => {
    await openSession(page, { width: 390, height: 844 });

    await expect(page.locator("aside").first()).not.toBeVisible();

    await page.locator("header button").first().click();

    const sidebar = page.locator("aside").first();
    await expect(sidebar).toBeVisible();
    await expect(sidebar).toContainText("Quick Access");

    const width = await sidebar.evaluate((node) => node.getBoundingClientRect().width);
    expect(width).toBeGreaterThan(300);
  });
});