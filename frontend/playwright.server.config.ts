import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-server",
  retries: 0,
  reporter: [["list"]],
  outputDir: "../output/playwright/server-results",
  use: { baseURL: "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev:server",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: false,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
