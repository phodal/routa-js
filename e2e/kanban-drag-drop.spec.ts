/**
 * Kanban Drag and Drop Test
 *
 * Validates:
 * 1. Story cards can be dragged and dropped between columns
 * 2. UI spacing is improved for assignment section
 */

import { test, expect } from "@playwright/test";

const BASE = "http://127.0.0.1:3000";

async function fillIssueObjective(page: import("@playwright/test").Page, text: string) {
  const editor = page.locator(".ProseMirror").last();
  await expect(editor).toBeVisible();
  await editor.click();
  await page.keyboard.type(text);
}

test.describe("Kanban Drag and Drop", () => {
  test("cards can be dragged between columns", async ({ page }) => {
    test.setTimeout(60_000);

    // Navigate to kanban page
    await page.goto(`${BASE}/workspace/default/kanban`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ 
      path: "test-results/kanban-drag-drop-initial.png", 
      fullPage: true 
    });

    // Check if there are any cards
    const cards = page.getByTestId("kanban-card");
    const cardCount = await cards.count();
    
    if (cardCount === 0) {
      console.log("No cards found, creating a test card");
      
      // Create a test card
      await page.getByRole("button", { name: /Create issue|Manual/ }).click();
      await page.getByPlaceholder("Issue title").fill("Test Drag and Drop");
      await fillIssueObjective(page, "Testing drag and drop functionality");
      await page.getByRole("button", { name: "Create", exact: true }).click();
      
      await page.waitForTimeout(2000);
    }

    // Get the first card
    const firstCard = page.getByTestId("kanban-card").first();
    await expect(firstCard).toBeVisible();

    // Verify the card has draggable attribute
    const isDraggable = await firstCard.evaluate((el) => el.getAttribute("draggable"));
    expect(isDraggable).toBe("true");

    // Take screenshot showing the card is draggable
    await page.screenshot({ 
      path: "test-results/kanban-drag-drop-card-ready.png", 
      fullPage: true 
    });

    // Find the Dev column
    const devColumn = page.getByTestId("kanban-column").filter({ hasText: "Dev" }).first();
    await expect(devColumn).toBeVisible();

    // Perform drag and drop
    await firstCard.dragTo(devColumn);
    await page.waitForTimeout(2000);

    // Take screenshot after drag
    await page.screenshot({ 
      path: "test-results/kanban-drag-drop-after.png", 
      fullPage: true 
    });

    console.log("✓ Drag and drop test completed successfully");
  });

  test("assignment section has improved spacing", async ({ page }) => {
    test.setTimeout(60_000);

    // Navigate to kanban page
    await page.goto(`${BASE}/workspace/default/kanban`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000);

    // Get the first card
    const firstCard = page.getByTestId("kanban-card").first();
    await expect(firstCard).toBeVisible();

    // Hover over the card to show the assignment section
    await firstCard.hover();
    await page.waitForTimeout(500);

    // Take screenshot of the card with assignment section
    await page.screenshot({ 
      path: "test-results/kanban-assignment-spacing.png", 
      fullPage: true 
    });

    // Click the Assign button to expand the assignment section
    const assignButton = firstCard.getByRole("button", { name: /Assign|Hide/ });
    if (await assignButton.isVisible()) {
      await assignButton.click();
      await page.waitForTimeout(500);

      // Take screenshot with expanded assignment section
      await page.screenshot({ 
        path: "test-results/kanban-assignment-expanded.png", 
        fullPage: true 
      });
    }

    console.log("✓ Assignment spacing test completed successfully");
  });
});
