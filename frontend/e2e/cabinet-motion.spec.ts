import { expect, test } from "./onboarding";

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the summary counts up on the first visit only", async ({ page }) => {
    await page.goto("/dashboard");
    const students = page.getByRole("link", { name: /^Ученики: \d+$/ });
    await expect(students).toBeVisible();
    const final = (await students.getAttribute("aria-label"))?.split(": ")[1] ?? "";
    await expect(students.locator("strong")).toHaveText(final);

    const menu = page.getByRole("navigation", { name: "Основная навигация" });
    await menu.getByRole("link", { name: "Работы" }).click();
    await expect(page.getByRole("heading", { name: "Работы", level: 1 })).toBeAttached();
    await menu.getByRole("link", { name: "Обзор" }).click();
    await students.locator("strong").waitFor();
    expect(await students.locator("strong").innerText()).toBe(final);
  });

  test("a confirmed gap is rewritten in ink", async ({ page }) => {
    await page.goto("/works/demo-ready");
    const gap = page.locator(".dp-gap-proposal").first();
    const ink = () => gap.evaluate((element) => getComputedStyle(element, "::after").clipPath);
    await expect.poll(ink).toBe("inset(0px 100% 0px 0px)");
    await gap.getByRole("button", { name: "Подтвердить пробел" }).click();
    await expect.poll(ink).toBe("inset(0px)");
  });

  test("buttons give way under a press", async ({ page, isMobile }) => {
    test.skip(isMobile, "a press is checked with a mouse");
    await page.goto("/dashboard");
    const button = page.getByRole("button", { name: "Настроить" });
    const scale = () => button.evaluate((element) => getComputedStyle(element).scale);
    const box = await button.boundingBox();
    if (!box) throw new Error("button is not on screen");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await expect.poll(scale).toBe("0.97");
    await page.mouse.move(box.x + box.width / 2, box.y + box.height + 200);
    await page.mouse.up();
    await expect.poll(scale).toBe("none");
  });

  test("choosing a topic redraws its path in ink", async ({ page, isMobile }) => {
    test.skip(isMobile, "the drawn map is shown on a wide screen");
    await page.goto("/students/anna?tab=map");
    const path = page.locator(".dp-map-edge.is-path").first();
    await expect(path).toBeAttached();
    await expect
      .poll(() => path.evaluate((element) => getComputedStyle(element).animationName))
      .toBe("dp-map-ink");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the summary and the gap are drawn at once", async ({ page }) => {
    await page.goto("/dashboard");
    const students = page.getByRole("link", { name: /^Ученики: \d+$/ });
    await expect(students).toBeVisible();
    const final = (await students.getAttribute("aria-label"))?.split(": ")[1] ?? "";
    expect(await students.locator("strong").innerText()).toBe(final);

    await page.goto("/works/demo-ready");
    const gap = page.locator(".dp-gap-proposal").first();
    await expect(gap).toBeVisible();
    expect(await gap.evaluate((element) => getComputedStyle(element, "::after").content)).toBe(
      "none",
    );
  });
});
