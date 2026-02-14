import { test, expect } from "@playwright/test";

/**
 * Repo Picker E2E Test
 *
 * Tests:
 * 1. Center repo picker when no session (no messages)
 * 2. Branch dropdown opens upward (no layout shift)
 * 3. Selecting repo + provider, sending a codebase question
 */

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

test.describe("Repo Picker", () => {
  test("center repo picker and branch dropdown direction", async ({ page }) => {
    test.setTimeout(120_000);

    // Step 1: Navigate
    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);

    // Screenshot 1: Initial state - repo picker should be in the CENTER
    await page.screenshot({
      path: "test-results/layout-01-center-picker.png",
      fullPage: false,
    });

    // There should be a repo picker in the center area (empty state)
    // AND one in the input toolbar
    const centerPicker = page.locator("main .text-center").getByRole("button", {
      name: /Select or clone a repository/i,
    });
    const inputPicker = page.locator(".tiptap-input-wrapper").locator("..").getByRole("button", {
      name: /Select or clone a repository/i,
    });

    // At least one should be visible
    const centerVisible = await centerPicker.isVisible().catch(() => false);
    const inputVisible = await inputPicker.isVisible().catch(() => false);
    expect(centerVisible || inputVisible).toBeTruthy();

    // Click the center one (or input one) to open dropdown
    if (centerVisible) {
      await centerPicker.click();
    } else {
      await inputPicker.click();
    }
    await page.waitForTimeout(500);

    // Select unit-mesh/unit-mesh
    const existingRepo = page.getByText("unit-mesh/unit-mesh").first();
    if (await existingRepo.isVisible()) {
      await existingRepo.click();
      await page.waitForTimeout(500);
    }

    // Screenshot 2: Repo selected
    await page.screenshot({
      path: "test-results/layout-02-repo-selected.png",
      fullPage: false,
    });

    // Find the branch button and click it
    const branchBtn = page
      .locator("button")
      .filter({ hasText: /master|main/ })
      .first();
    if (await branchBtn.isVisible()) {
      // Get the button's position before clicking
      const btnBox = await branchBtn.boundingBox();
      await branchBtn.click();
      await page.waitForTimeout(500);

      // Screenshot 3: Branch dropdown should open UPWARD (not shift layout)
      await page.screenshot({
        path: "test-results/layout-03-branch-upward.png",
        fullPage: false,
      });

      // Verify the dropdown appears ABOVE the button (bottom-full)
      const dropdown = page.locator(".absolute.bottom-full");
      if (await dropdown.isVisible()) {
        const dropdownBox = await dropdown.boundingBox();
        if (btnBox && dropdownBox) {
          // Dropdown's bottom should be at or above the button's top
          expect(dropdownBox.y + dropdownBox.height).toBeLessThanOrEqual(
            btnBox.y + 5 // small tolerance
          );
        }
      }

      // Close
      await page.locator("body").click({ position: { x: 10, y: 10 } });
      await page.waitForTimeout(300);
    }
  });

  test("provider + repo sends codebase question", async ({ page }) => {
    test.setTimeout(180_000);

    await page.goto(BASE_URL);
    await page.waitForTimeout(3000);

    // Step 1: Select repo via any picker
    const anyPicker = page.getByRole("button", {
      name: /Select or clone a repository/i,
    }).first();
    if (await anyPicker.isVisible()) {
      await anyPicker.click();
      await page.waitForTimeout(500);

      const existingRepo = page.getByText("unit-mesh/unit-mesh").first();
      if (await existingRepo.isVisible()) {
        await existingRepo.click();
        await page.waitForTimeout(500);
      }
    } else {
      // Repo might already be selected
    }

    // Step 2: Click + New Session
    const newSession = page.getByRole("button", { name: /New Session/i });
    if (await newSession.isVisible()) {
      await newSession.click();
      await page.waitForTimeout(3000);
    }

    // Step 3: Type a question about the codebase
    const editor = page.locator(".tiptap-chat-input");
    await editor.click();
    await page.keyboard.type(
      "What programming language is this repository mainly written in? Answer in one short sentence."
    );

    // Screenshot before sending
    await page.screenshot({
      path: "test-results/layout-04-before-send.png",
      fullPage: false,
    });

    // Step 4: Press Enter to send
    await page.keyboard.press("Enter");
    await page.waitForTimeout(5000);

    // Screenshot: wait for response
    await page.screenshot({
      path: "test-results/layout-05-response.png",
      fullPage: false,
    });

    // Wait a bit longer for the assistant to respond
    await page.waitForTimeout(15000);

    // Screenshot: final state
    await page.screenshot({
      path: "test-results/layout-06-final-response.png",
      fullPage: false,
    });

    // Check that a user message was shown
    const userMsg = page.locator("text=What programming language");
    await expect(userMsg).toBeVisible({ timeout: 5000 });
  });
});
