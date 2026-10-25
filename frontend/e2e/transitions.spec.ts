import type { Page } from "@playwright/test";
import { expect, test } from "./onboarding";

async function watchTransitions(page: Page) {
  await page.addInitScript(() => {
    const seen: string[][] = [];
    Object.assign(window, { seenTransitions: seen });
    if (!document.startViewTransition) return;
    const original = document.startViewTransition.bind(document);
    document.startViewTransition = ((update: ViewTransitionUpdateCallback) => {
      const transition = original(update);
      void transition.ready.then(() =>
        seen.push(
          document
            .getAnimations()
            .map((animation) => (animation.effect as KeyframeEffect | null)?.pseudoElement ?? ""),
        ),
      );
      return transition;
    }) as typeof document.startViewTransition;
  });
}

const seen = (page: Page) =>
  page.evaluate(() => (window as unknown as { seenTransitions: string[][] }).seenTransitions);

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("opening a work moves its title into the review", async ({ page }) => {
    await watchTransitions(page);
    await page.goto("/works");
    const supported = await page.evaluate(() => "startViewTransition" in document);
    test.skip(!supported, "this browser has no view transitions");
    const row = page.locator(".dp-work-row").first();
    const title = await row.locator(".dp-work-title").innerText();
    await row.click();
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    const [animations] = await seen(page);
    expect(animations).toContain("::view-transition-new(dp-main)");
    expect(animations).toContain("::view-transition-group(dp-work-title)");
    expect(animations).not.toContain("::view-transition-new(dp-sidebar)");
  });

  test("navigation still works without view transitions", async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(document, "startViewTransition", { value: undefined });
    });
    await page.goto("/dashboard");
    await page
      .getByRole("navigation", { name: "Основная навигация" })
      .getByRole("link", { name: "Работы" })
      .click();
    await expect(page).toHaveURL(/\/works$/);
    await page.locator(".dp-work-row").first().click();
    await expect(page).toHaveURL(/\/works\/[\w-]+$/);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("pages change without animation", async ({ page }) => {
    await watchTransitions(page);
    await page.goto("/works");
    const supported = await page.evaluate(() => "startViewTransition" in document);
    test.skip(!supported, "this browser has no view transitions");
    await page.locator(".dp-work-row").first().click();
    await expect(page).toHaveURL(/\/works\/[\w-]+$/);
    await expect.poll(async () => (await seen(page)).length).toBe(1);
    const [animations] = await seen(page);
    expect(animations.filter((name) => name.startsWith("::view-transition"))).toEqual([]);
  });
});
