import { test as base, expect } from "@playwright/test";
import { defaultScenario, mockApi, type Scenario } from "./api";

export const demoUrl = "http://127.0.0.1:5180";
export const serverUrl = "http://127.0.0.1:5181";
export const fixedNow = new Date("2026-03-16T09:00:00+03:00");

function stableIds() {
  let counter = 0;
  Object.defineProperty(crypto, "randomUUID", {
    configurable: true,
    value: () => "00000000-0000-4000-8000-" + String(++counter).padStart(12, "0"),
  });
}

function expectedNoise(text: string) {
  return text.startsWith("Failed to load resource");
}

export const test = base.extend<{ scenario: Scenario; problems: string[] }>({
  scenario: [defaultScenario, { option: true }],
  problems: [
    async ({ page, baseURL, scenario }, use) => {
      const problems: string[] = [];
      page.on("pageerror", (error) => problems.push("pageerror: " + error.message));
      page.on("console", (message) => {
        if (message.type() === "error" && !expectedNoise(message.text()))
          problems.push("console: " + message.text());
      });
      await page.clock.setFixedTime(fixedNow);
      await page.addInitScript(stableIds);
      const unhandled =
        baseURL === serverUrl ? await mockApi(page, scenario, fixedNow.getTime()) : [];
      await use(problems);
      expect(problems, "console and page errors").toEqual([]);
      expect(unhandled, "requests without a mock").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };
