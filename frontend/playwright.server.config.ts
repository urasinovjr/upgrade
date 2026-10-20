import { defineConfig, devices } from "@playwright/test";

const externalUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e-server",
  retries: 0,
  reporter: [["list"]],
  outputDir: "../output/playwright/server-results",
  use: { baseURL: externalUrl ?? "http://127.0.0.1:5173", trace: "retain-on-failure" },
  webServer: externalUrl
    ? undefined
    : { command: "npm run dev:server", url: "http://127.0.0.1:5173", reuseExistingServer: false },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
  ],
});
