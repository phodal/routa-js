import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  use: {
    baseURL: "http://localhost:3000",
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
