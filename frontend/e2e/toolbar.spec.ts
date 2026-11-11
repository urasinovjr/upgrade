import { expect, test } from "./onboarding";

test.describe("desktop pointer", () => {
  test.use({ isMobile: false, hasTouch: false, deviceScaleFactor: 2 });
  test("student toolbar fits through tablet widths", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/students/anna?tab=map");
    await expect(page.getByRole("heading", { name: "Анна Соколова", exact: true })).toBeVisible();
    for (const width of [320, 390, 700, 701, 768, 900, 901, 1024, 1200, 1440]) {
      await page.setViewportSize({ width, height: 844 });
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth))
        .toBeLessThanOrEqual(width);
    }
  });
});

test("student toolbar reflows after changing the viewport without reloading", async ({ page }) => {
  test.setTimeout(90_000);
  await page.goto("/students/anna?tab=map");
  await expect(page.getByRole("heading", { name: "Анна Соколова", exact: true })).toBeVisible();
  for (const width of [390, 700, 701, 768, 1024, 1199, 1200, 1440, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
      .toBe(true);
  }
});

test("student actions and the four navigation links fit on narrow screens", async ({
  page,
}, testInfo) => {
  test.setTimeout(90_000);
  for (const width of [320, 390, 700, 701, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/students/anna");
    await expect(page.getByRole("heading", { name: "Анна Соколова", exact: true })).toBeVisible();
    const access = page.getByRole("button", { name: "Доступ ученика", exact: true });
    await expect(access).toBeVisible();
    const broken = await page.locator(".dp-topbar-actions button").evaluateAll((buttons) =>
      buttons
        .filter((button) => {
          const box = button.getBoundingClientRect();
          const header = button.closest(".dp-topbar")!.getBoundingClientRect();
          return (
            box.height > 48 ||
            box.top < header.top ||
            box.bottom > header.bottom + 1 ||
            box.right > innerWidth
          );
        })
        .map((button) => button.textContent),
    );
    expect(broken).toEqual([]);
    const links = page.getByRole("navigation", { name: "Основная навигация" }).getByRole("link");
    await expect(links).toHaveCount(4);
    expect(
      await links.evaluateAll((links) =>
        links.every((link) => {
          const box = link.getBoundingClientRect();
          return box.top >= 0 && box.bottom <= innerHeight && box.right <= innerWidth;
        }),
      ),
    ).toBe(true);
    if ([390, 768, 1440].includes(width)) {
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: testInfo.outputPath("student-toolbar-" + width + ".png"),
        animations: "disabled",
      });
    }
  }
});
