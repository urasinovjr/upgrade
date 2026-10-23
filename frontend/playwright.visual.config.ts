import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e-visual",
  fullyParallel: true,
  timeout: 60_000,
  retries: 0,
  snapshotPathTemplate: "{testDir}/{testFileName}-snapshots/{arg}-{projectName}{ext}",
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "../output/playwright/visual-report" }],
  ],
  outputDir: "../output/playwright/visual-results",
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: "disabled",
      caret: "hide",
      scale: "css",
      threshold: 0.2,
      maxDiffPixels: 0,
    },
  },
  use: {
    locale: "ru-RU",
    timezoneId: "Europe/Moscow",
    colorScheme: "light",
    contextOptions: { reducedMotion: "reduce" },
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "npm run dev -- --port 5180",
      url: "http://127.0.0.1:5180",
      reuseExistingServer: !process.env.CI,
    },
    {
      command: "npm run dev:server -- --port 5181",
      url: "http://127.0.0.1:5181",
      reuseExistingServer: !process.env.CI,
    },
  ],
  projects: [
    {
      name: "desktop",
      grep: /@desktop/,
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    { name: "mobile", grep: /@mobile/, use: { ...devices["iPhone 13"] } },
  ],
});
