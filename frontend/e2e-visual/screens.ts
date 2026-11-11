import type { Page } from "@playwright/test";
import { defaultScenario, type Scenario } from "./api";
import { auditPage, capture, type CaptureOptions } from "./audit";
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
export const primaryWidths = [390, 768, 1440];
export const secondaryWidths = [390, 1440];
export const sweepWidths = [320, 390, 700, 701, 768, 900, 901, 1024, 1199, 1200, 1201, 1440, 1920];

function viewportHeight(width: number) {
  return width === 768 ? 1024 : 900;
}

function useScenario(screen: Screen) {
  if (screen.scenario) test.use({ scenario: { ...defaultScenario, ...screen.scenario } });
}

export function checkScreens(screens: Screen[]) {
  for (const screen of screens) {
    test.describe(screen.name, () => {
      useScenario(screen);
      for (const width of screen.widths) {
        const tag = width === phone ? "@mobile" : "@desktop";
        test(screen.name + " " + width, { tag }, async ({ page }) => {
          if (screen.capture?.timeout) test.setTimeout(screen.capture.timeout + 45_000);
          if (width !== phone) await page.setViewportSize({ width, height: viewportHeight(width) });
          await page.goto(screen.path);
          await screen.prepare?.(page);
          await capture(page, screen.name + "-" + width, screen.capture);
        });
      }
    });
  }
}

export function checkLayouts(screens: Screen[]) {
  for (const screen of screens) {
    test.describe(screen.name, () => {
      useScenario(screen);
      test(screen.name + " layout", { tag: "@sweep" }, async ({ page }) => {
        await page.setViewportSize({ width: screen.widths[0], height: 900 });
        await page.goto(screen.path);
        await screen.prepare?.(page);
        for (const width of sweepWidths) {
          await test.step(width + "px", async () => {
            await page.setViewportSize({ width, height: 900 });
            await auditPage(page, screen.capture);
          });
        }
      });
    });
  }
}
