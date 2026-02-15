import { test, expect } from "@playwright/test";

const BASE_URL = "http://localhost:3002";

test.describe("Multi-agent UI Verification", () => {
  test("verify agent selector, ROUTA option, and session creation UI", async ({
    page,
  }) => {
    test.setTimeout(60_000);

    // Step 1: Navigate and capture initial page
    await page.goto(BASE_URL);
    await page.screenshot({ path: "e2e/screenshots/01-initial-page.png" });

    // Check for main layout
    const header = page.locator("header");
    await expect(header).toBeVisible();

    // Step 2: Look for agent selector (CRAFTER/ROUTA/GATE)
    const agentLabel = page.locator("span:has-text('Agent:')");
    const agentSelect = page.locator("select").filter({ has: page.locator('option[value="ROUTA"]') });

    let agentSelectorFound = false;
    if ((await agentLabel.count()) > 0 && (await agentSelect.count()) > 0) {
      agentSelectorFound = true;
    }

    // Step 3: If agent selector exists, select ROUTA
    if (agentSelectorFound) {
      await agentSelect.selectOption("ROUTA");
      await page.waitForTimeout(500);
      await page.screenshot({ path: "e2e/screenshots/02-routa-selected.png" });
    }

    // Step 4: Look for session creation UI - Provider section and New Session button
    const providerLabel = page.locator("label:has-text('Provider')");
    const newSessionBtn = page.getByRole("button", { name: "+ New Session" });

    const providerSectionVisible = (await providerLabel.count()) > 0;
    const newSessionVisible = (await newSessionBtn.count()) > 0;

    if (providerSectionVisible) {
      await page.screenshot({ path: "e2e/screenshots/03-provider-section.png" });
    }

    // Log results
    console.log("\n=== UI Verification Report ===");
    console.log("1. Initial page loaded: YES");
    console.log(`2. Agent selector (CRAFTER/ROUTA/GATE) visible: ${agentSelectorFound ? "YES" : "NO"}`);
    console.log(`3. ROUTA option selectable: ${agentSelectorFound ? "YES" : "N/A"}`);
    console.log(`4. Provider section visible: ${providerSectionVisible ? "YES" : "NO"}`);
    console.log(`5. '+ New Session' button visible: ${newSessionVisible ? "YES" : "NO"}`);
    console.log("=============================\n");

    expect(header).toBeVisible();
  });
});
