import { test as base } from "@playwright/test";
import { completedOnboarding } from "../src/domain/onboarding";

export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) {
      await page.route("**/api/account/preferences/onboarding", (route) =>
        route.request().method() === "GET"
          ? route.fulfill({ json: completedOnboarding() })
          : route.fallback(),
      );
    }
    await use(page);
  },
});

export { expect } from "@playwright/test";
