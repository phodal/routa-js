import { test, expect } from "@playwright/test";

test.describe("ACP Chat with OpenCode", () => {
  test("full flow: connect → new session → send message → receive response", async ({
    page,
  }) => {
    // Increase timeout for opencode process startup + LLM response
    test.setTimeout(120_000);

    // Navigate to the app
    await page.goto("http://localhost:3000");

    // Verify the page loaded
    await expect(page.locator("h1")).toHaveText("Routa");

    // Step 1: Click Connect
    const connectBtn = page.getByRole("button", { name: "Connect" });
    await expect(connectBtn).toBeVisible();
    await connectBtn.click();

    // Wait for connection (button changes to "Disconnect")
    const disconnectBtn = page.getByRole("button", { name: "Disconnect" });
    await expect(disconnectBtn).toBeVisible({ timeout: 10_000 });

    // Step 2: Click "New" to create a session
    const newBtn = page.getByRole("button", { name: "New" });
    await newBtn.click();

    // Wait for session to be created - wait for input to be enabled
    const input = page.getByPlaceholder("Type a message...");
    await expect(input).toBeEnabled({ timeout: 30_000 });

    // Step 3: Type and send a message
    await input.fill("Hello! What is 2+2? Please respond with just the number.");
    await input.press("Enter");

    // Step 4: Wait for user message to appear
    const userMessage = page.locator("text=Hello! What is 2+2?");
    await expect(userMessage).toBeVisible({ timeout: 5_000 });

    // Step 5: Wait for assistant response to stream in
    // The assistant message has class bg-gray-100 and is inside the messages area
    // Wait for text that looks like an answer (not the "Connected to opencode" system msg)
    // We use a polling approach to wait for the assistant message
    await page.waitForFunction(
      () => {
        // Find all message bubbles in the chat area
        const bubbles = document.querySelectorAll(
          ".bg-gray-100.rounded-2xl"
        );
        // Check if any contain actual text content (not just "Connected")
        for (const bubble of bubbles) {
          const text = bubble.textContent || "";
          if (text.length > 0 && !text.includes("Connected")) {
            return true;
          }
        }
        return false;
      },
      { timeout: 60_000 }
    );

    // Take a screenshot of the final state
    await page.screenshot({
      path: "test-results/acp-chat-final.png",
      fullPage: true,
    });

    // Extract and log the assistant response
    const assistantBubbles = page.locator(".bg-gray-100.rounded-2xl");
    const count = await assistantBubbles.count();
    console.log(`Found ${count} assistant message bubble(s)`);

    for (let i = 0; i < count; i++) {
      const text = await assistantBubbles.nth(i).textContent();
      console.log(`  Bubble ${i}: ${text?.slice(0, 200)}`);
    }

    // Verify at least one response exists
    expect(count).toBeGreaterThan(0);
  });
});
