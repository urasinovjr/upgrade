import { expect, test, writeDemo } from "./onboarding";

test.use({ onboarded: false });

test("a cabinet with a confirmed work does not start the tour by itself", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Обзор", level: 1 })).toBeAttached();
  await expect(page.locator(".dp-widget").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("a new cabinet starts the tour once and remembers the choice", async ({ page, isMobile }) => {
  await page.goto("/dashboard");
  await expect(page.locator(".dp-widget").first()).toBeVisible();
  await writeDemo(page, "state", "root", { works: [], students: [], closures: [] });
  await page.reload();

  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Начните с ДЗ" })).toBeVisible();
  const total = isMobile ? 4 : 5;
  await expect(tour).toContainText(`Шаг 1 из ${total}`);
  await expect(tour).toBeFocused();

  await page.keyboard.press("ArrowRight");
  await expect(tour).toContainText(`Шаг 2 из ${total}`);
  await page.keyboard.press("ArrowLeft");
  await expect(tour).toContainText(`Шаг 1 из ${total}`);

  for (let press = 0; press < 4; press += 1) {
    await page.keyboard.press("Tab");
    expect(await tour.evaluate((card) => card.contains(document.activeElement))).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Обзор", level: 1 })).toBeAttached();
  await page.waitForTimeout(500);
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the question mark runs the tour again and skips a removed block", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "the question mark lives in the sidebar");
  await page.goto("/dashboard");
  await expect(page.locator(".dp-widget").first()).toBeVisible();
  await writeDemo(page, "preferences", "dashboard-layout", {
    version: 1,
    items: [
      { id: "kpis", span: 12 },
      { id: "roster", span: 12 },
    ],
  });
  await page.reload();
  await expect(page.locator('[data-widget="roster"]')).toBeVisible();

  await page.getByRole("button", { name: "Знакомство с кабинетом" }).click();
  const tour = page.getByRole("dialog");
  await expect(tour).toContainText("Шаг 1 из 4");
  for (const title of [
    "Ученики и карта знаний",
    "Обзор под вас",
    "Знакомство можно пройти заново",
  ]) {
    await tour.getByRole("button", { name: "Дальше" }).click();
    await expect(tour.getByRole("heading", { name: title })).toBeVisible();
  }
  await tour.getByRole("button", { name: "Готово" }).click();
  await expect(tour).toHaveCount(0);
  await page.reload();
  await expect(page.locator('[data-widget="roster"]')).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("the tour started from another page finds every target", async ({ page, isMobile }) => {
  test.skip(isMobile, "the question mark lives in the sidebar");
  await page.goto("/works");
  await expect(page.locator(".dp-work-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Знакомство с кабинетом" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("dialog")).toContainText("Шаг 1 из 5");
});

test("each first-visit hint shows once", async ({ page }) => {
  for (const [path, title] of [
    ["/works/demo-ready", "Это черновик ИИ"],
    ["/students/anna", "Как читать карту знаний"],
  ]) {
    await page.goto(path);
    const hint = page.getByRole("complementary", { name: title });
    await expect(hint).toBeVisible();
    await hint.getByRole("button", { name: "Понятно" }).click();
    await expect(hint).toHaveCount(0);
    await page.reload();
    await expect(page.locator("h1").first()).toBeVisible();
    await expect(page.getByRole("complementary", { name: title })).toHaveCount(0);
  }
});
