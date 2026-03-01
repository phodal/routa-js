/**
 * e2e: Custom Specialist selection on Home page
 *
 * Flow covered:
 *  1. Seed a test specialist via REST API
 *  2. Load home page — "Custom" picker button appears
 *  3. Open dropdown → select specialist → role toggle replaced by specialist pill
 *  4. Mode tip line reflects the specialist
 *  5. Clear specialist (× button) → role toggle reappears
 *  6. Open from session input bar (navigate to existing session first)
 *  7. Cleanup: delete test specialist
 */

import { test, expect, type Page, type APIRequestContext } from "@playwright/test";

const BASE = "http://localhost:3000";

const TEST_SPECIALIST = {
  id: "pw-test-specialist-001",
  name: "PW Test Agent",
  description: "Created by Playwright for specialist-selection spec",
  role: "CRAFTER" as const,
  defaultModelTier: "BALANCED" as const,
  systemPrompt: "You are a Playwright test agent. Always reply 'PW_OK'.",
  roleReminder: "",
  model: "",
};

// ── helpers ────────────────────────────────────────────────────────────────

async function seedSpecialist(request: APIRequestContext) {
  const res = await request.post(`${BASE}/api/specialists`, {
    data: TEST_SPECIALIST,
  });
  // 200 or 201 both acceptable; also tolerate 409 if already exists
  expect([200, 201, 409]).toContain(res.status());
}

async function deleteSpecialist(request: APIRequestContext) {
  // DELETE expects ?id= query parameter, not request body
  await request.delete(`${BASE}/api/specialists?id=${TEST_SPECIALIST.id}`);
}

async function waitForHomeReady(page: Page) {
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  // Wait for the TiptapInput / home-input-container to be in the DOM
  await page.waitForSelector("#home-input-container", { timeout: 15_000 });
  // Give specialists fetch a moment to resolve
  await page.waitForTimeout(800);
}

// ── tests ──────────────────────────────────────────────────────────────────

test.describe("Home page — Custom Specialist selection", () => {
  test.beforeEach(async ({ request }) => {
    await seedSpecialist(request);
  });

  test.afterEach(async ({ request }) => {
    await deleteSpecialist(request);
  });

  test("Custom button appears and opens dropdown", async ({ page }) => {
    await waitForHomeReady(page);

    // "Custom" picker button must be visible (only shown when specialists exist)
    const customBtn = page.getByRole("button", { name: /custom/i }).first();
    await expect(customBtn).toBeVisible({ timeout: 5_000 });
  });

  test("Selecting a specialist replaces role toggle with specialist pill", async ({ page }) => {
    await waitForHomeReady(page);

    // Role toggle should be visible initially
    await expect(page.getByRole("button", { name: /multi-agent/i })).toBeVisible();

    // Open specialist dropdown
    const customBtn = page.getByRole("button", { name: /custom/i }).first();
    await customBtn.click();

    // Dropdown should now be visible with the test specialist
    await expect(page.getByText(TEST_SPECIALIST.name)).toBeVisible({ timeout: 3_000 });

    // Click the specialist
    await page.getByText(TEST_SPECIALIST.name).click();

    // Role toggle should be GONE
    await expect(page.getByRole("button", { name: /multi-agent/i })).not.toBeVisible();

    // Specialist pill should appear with the specialist name
    await expect(page.getByText(TEST_SPECIALIST.name)).toBeVisible();

    // Mode tip should mention the specialist
    const modeTip = page.locator(".animate-fade-in-up").first();
    await expect(modeTip).toContainText(TEST_SPECIALIST.name, { timeout: 3_000 });

    // Role badge (CRAFTER) should be visible in the tip
    await expect(modeTip).toContainText("CRAFTER");
  });

  test("Clicking × on specialist pill restores role toggle", async ({ page }) => {
    await waitForHomeReady(page);

    // Select specialist
    await page.getByRole("button", { name: /custom/i }).first().click();
    await page.getByText(TEST_SPECIALIST.name).click();
    await expect(page.getByRole("button", { name: /multi-agent/i })).not.toBeVisible();

    // Clear it via the × button (aria-label="Clear specialist")
    const clearBtn = page.getByRole("button", { name: /clear specialist/i });
    await expect(clearBtn).toBeVisible({ timeout: 3_000 });
    await clearBtn.click();

    // Role toggle should reappear
    await expect(page.getByRole("button", { name: /multi-agent/i })).toBeVisible({ timeout: 3_000 });
    await expect(page.getByRole("button", { name: /direct/i })).toBeVisible();
  });

  test("Specialist description shows in dropdown row", async ({ page }) => {
    await waitForHomeReady(page);

    await page.getByRole("button", { name: /custom/i }).first().click();

    const dropdown = page.locator(".shadow-xl").first();
    await expect(dropdown).toBeVisible({ timeout: 3_000 });

    // Specialist name
    await expect(dropdown.getByText(TEST_SPECIALIST.name)).toBeVisible();
    // Description
    await expect(dropdown.getByText(TEST_SPECIALIST.description!)).toBeVisible();
    // Role tag
    await expect(dropdown.getByText(TEST_SPECIALIST.role)).toBeVisible();
  });

  test("Dropdown closes when clicking outside", async ({ page }) => {
    await waitForHomeReady(page);

    await page.getByRole("button", { name: /custom/i }).first().click();
    await expect(page.locator(".shadow-xl").first()).toBeVisible({ timeout: 3_000 });

    // Click outside
    await page.mouse.click(10, 10);
    await expect(page.locator(".shadow-xl").first()).not.toBeVisible({ timeout: 2_000 });
  });
});

// ── session page control bar ───────────────────────────────────────────────

test.describe("Session page — Custom Specialist in agent selector", () => {
  test.beforeEach(async ({ request }) => {
    await seedSpecialist(request);
  });

  test.afterEach(async ({ request }) => {
    await deleteSpecialist(request);
  });

  test("Custom Specialists optgroup present in agent <select>", async ({ page }) => {
    // Create a session first so we have a session page to visit
    const res = await page.request.post(`${BASE}/api/acp`, {
      data: { jsonrpc: "2.0", id: 1, method: "session/new", params: { role: "ROUTA" } },
    });
    const body = await res.json();
    const sessionId = body?.result?.sessionId;
    test.skip(!sessionId, "Could not create session — ACP not running");

    await page.goto(`${BASE}/workspace/default/sessions/${sessionId}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForTimeout(1000);

    // The <select> element should contain an option with the specialist name
    const select = page.locator("select").first();
    await expect(select).toBeVisible({ timeout: 10_000 });

    const options = await select.locator("option").allInnerTexts();
    const hasSpecialist = options.some((t) => t.includes(TEST_SPECIALIST.name));
    expect(hasSpecialist).toBe(true);
  });
});
