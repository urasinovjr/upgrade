import { expect, test } from "@playwright/test";

test("the welcome page explains the review and leads into the demo", async ({ page }) => {
  await page.goto("/welcome");
  await expect(page.locator("h1")).toHaveCount(1);
  await expect(page.locator("h1")).toHaveText("ИИ пишет карандашом, вы — ручкой");

  const gap = page.locator(".dp-landing-gap");
  await expect(gap).toHaveAttribute("data-decision", "hypothesis");
  await page.getByRole("button", { name: "Подтвердить пробел" }).click();
  await expect(gap).toHaveAttribute("data-decision", "confirmed");
  await expect(gap.getByRole("heading", { name: "Пробел подтверждён" })).toBeVisible();

  const topic = page.getByRole("button", { name: "Логарифмы" });
  await topic.click();
  await expect(topic).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("Свойства логарифмов с учётом ограничений.")).toBeVisible();

  await page.getByRole("button", { name: "Что, если ИИ ошибся?" }).click();
  await expect(page.getByText(/прямо рядом с фото/)).toBeVisible();

  await page.getByRole("main").getByRole("link", { name: "Открыть демо" }).first().click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

for (const width of [1440, 390]) {
  test(`the welcome page fits a ${width}px screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/welcome");
    await expect(page.locator("h1")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("the root address still opens the dashboard in demo mode", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
});
