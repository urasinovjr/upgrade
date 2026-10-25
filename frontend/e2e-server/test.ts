import { test as base } from "@playwright/test";
import { completedOnboarding } from "../src/domain/onboarding";

export const test = base.extend<{ onboarded: boolean }>({
  onboarded: [true, { option: true }],
  page: async ({ page, onboarded }, use) => {
    if (onboarded) {
      await page.addInitScript((value) => {
        const original = window.fetch;
        window.fetch = (input, init) => {
          const url = input instanceof Request ? input.url : String(input);
          const reading = (init?.method ?? "GET") === "GET";
          if (reading && url.endsWith("/account/preferences/onboarding")) {
            const body = JSON.stringify(value);
            const headers = { "Content-Type": "application/json" };
            return Promise.resolve(new Response(body, { headers }));
          }
          return original(input, init);
        };
      }, completedOnboarding());
    }
    await use(page);
  },
});

export { expect } from "@playwright/test";
