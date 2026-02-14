import { test, expect } from "@playwright/test";

test.describe("MCP Tools Page", () => {
  test("shows tool list and can execute a tool", async ({ page }) => {
    await page.goto("/mcp-tools");

    await expect(page.getByRole("heading", { name: "MCP Tools" })).toBeVisible();
    await expect(page.getByRole("button", { name: "list_agents" })).toBeVisible();

    await page.getByRole("button", { name: "Run Tool" }).click();
    await expect(page.locator("pre").first()).toContainText('"isError": false');
  });
});
