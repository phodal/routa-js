import { defineConfig } from "@playwright/test";

/**
 * Playwright configuration for testing the Tauri/Rust backend.
 * 
 * Usage:
 *   npx playwright test --config=playwright.tauri.config.ts
 * 
 * The Rust backend should be running on port 3210 before running tests.
 * Start it with: cd apps/desktop && npm run tauri dev
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://127.0.0.1:3210",
    headless: true,
    // capture a screenshot + trace on failure for easier debugging
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
    // Run with a visible browser window for local development / debugging
    {
      name: "chromium-headed",
      use: { browserName: "chromium", headless: false, launchOptions: { slowMo: 200 } },
    },
  ],
});

