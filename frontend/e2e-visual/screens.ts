import type { Page } from "@playwright/test";
import { defaultScenario, type Scenario } from "./api";
import { capture, type CaptureOptions } from "./audit";
import { test } from "./fixtures";

export interface Screen {
  name: string;
  path: string;
  widths: number[];
  scenario?: Partial<Scenario>;
  prepare?: (page: Page) => Promise<void>;
  capture?: CaptureOptions;
}

export const phone = 390;
export const allWidths = [390, 768, 1024, 1440];

function viewportHeight(width: number) {
  return width === 768 ? 1024 : 900;
}

export function checkScreens(screens: Screen[]) {
  for (const screen of screens) {
    test.describe(screen.name, () => {
      if (screen.scenario) test.use({ scenario: { ...defaultScenario, ...screen.scenario } });
      for (const width of screen.widths) {
        const tag = width === phone ? "@mobile" : "@desktop";
        test(screen.name + " " + width, { tag }, async ({ page }) => {
          if (width !== phone) await page.setViewportSize({ width, height: viewportHeight(width) });
          await page.goto(screen.path);
          await screen.prepare?.(page);
          await capture(page, screen.name + "-" + width, screen.capture);
        });
      }
    });
  }
}
