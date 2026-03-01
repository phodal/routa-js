import { test, expect } from "@playwright/test";

/**
 * Tauri/Rust Backend Verification Test
 * 
 * This test verifies that the Tauri application with Rust backend is working correctly.
 * Run with: npx playwright test --config=playwright.tauri.config.ts e2e/tauri-backend-check.spec.ts
 * 
 * Prerequisites:
 *   1. Start Tauri dev: cd apps/desktop && npm run tauri dev
 *   2. Wait for Rust backend to be ready on port 3210
 */
test.describe("Tauri/Rust Backend Verification", () => {
  test.setTimeout(60_000);

  // Use baseURL from config (127.0.0.1:3210 for Tauri)
  const getBaseUrl = () => {
    return process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3210";
  };

  test("Rust backend health check", async ({ request }) => {
    const baseUrl = getBaseUrl();
    const response = await request.get(`${baseUrl}/api/health`);
    expect(response.ok()).toBeTruthy();
    
    const data = await response.json();
    expect(data.status).toBe("ok");
    expect(data.server).toBe("routa-server");
    console.log("✓ Rust backend health:", data);
  });

  test("API endpoints work correctly", async ({ request }) => {
    const baseUrl = getBaseUrl();

    // Test agents endpoint
    const agentsRes = await request.get(`${baseUrl}/api/agents`);
    expect(agentsRes.ok()).toBeTruthy();
    const agents = await agentsRes.json();
    expect(agents).toHaveProperty("agents");
    console.log("✓ Agents API:", agents);

    // Test workspaces endpoint
    const workspacesRes = await request.get(`${baseUrl}/api/workspaces`);
    expect(workspacesRes.ok()).toBeTruthy();
    const workspaces = await workspacesRes.json();
    expect(workspaces).toHaveProperty("workspaces");
    console.log("✓ Workspaces API:", workspaces);

    // Test sessions endpoint
    const sessionsRes = await request.get(`${baseUrl}/api/sessions`);
    expect(sessionsRes.ok()).toBeTruthy();
    console.log("✓ Sessions API working");
  });

  test("Frontend loads correctly from Rust backend", async ({ page }) => {
    const baseUrl = getBaseUrl();
    
    // Navigate to the main page served by Rust backend
    await page.goto(baseUrl);
    
    // Take screenshot
    await page.screenshot({
      path: "test-results/tauri-01-main-page.png",
      fullPage: true,
    });

    // Check that the page loads - look for Routa branding
    await expect(page.locator("header span").filter({ hasText: "Routa" })).toBeVisible({ timeout: 15_000 });
    console.log("✓ Routa header visible");

    // Check main content is present
    await expect(page.locator("main")).toBeVisible();
    console.log("✓ Main content visible");

    // Check MCP link is present in navigation
    await expect(page.getByRole("link", { name: "MCP" })).toBeVisible();
    console.log("✓ MCP link visible");

    // Full page screenshot
    await page.screenshot({
      path: "test-results/tauri-02-full-page.png",
      fullPage: true,
    });
  });

  test("MCP test page works", async ({ page }) => {
    const baseUrl = getBaseUrl();
    
    await page.goto(`${baseUrl}/mcp-test`);
    
    await page.screenshot({
      path: "test-results/tauri-03-mcp-test.png",
      fullPage: true,
    });

    // Verify page loaded
    await expect(page).toHaveURL(/mcp-test/);
    console.log("✓ MCP test page loaded");
  });

  test("Settings page works", async ({ page }) => {
    const baseUrl = getBaseUrl();
    
    await page.goto(`${baseUrl}/settings`);
    
    // Wait for page to load
    await page.waitForLoadState("networkidle");
    
    await page.screenshot({
      path: "test-results/tauri-04-settings.png",
      fullPage: true,
    });

    console.log("✓ Settings page loaded");
  });
});

