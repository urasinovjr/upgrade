import { expect, test } from "@playwright/test";

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

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

  test("everything is drawn at once and the topic ribbon has no stop button", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator('.dp-landing-window [data-shown="false"]')).toHaveCount(0);
    await expect(page.locator('[data-revealed="false"]')).toHaveCount(0);
    await expect(
      page.locator(
        '.dp-landing-underline .dp-ink-stroke[data-drawn="false"], .dp-landing-step-ok .dp-ink-stroke[data-drawn="false"]',
      ),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Остановить ленту" })).toHaveCount(0);
    await expect(page.locator("html")).not.toHaveClass(/lenis/);
  });
});

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the demo plays by itself and stops when you take over", async ({ page }) => {
    await page.goto("/welcome");
    const demo = page.locator(".dp-landing-window");
    const gap = page.locator(".dp-landing-gap");
    await demo.scrollIntoViewIfNeeded();
    await expect(demo).toHaveAttribute("data-playing", "true");
    await expect(gap).toHaveAttribute("data-decision", "confirmed", { timeout: 15_000 });

    await gap.getByRole("button", { name: "Отменить подтверждение" }).click();
    await expect(demo).toHaveAttribute("data-playing", "false");
    await expect(gap).toHaveAttribute("data-decision", "hypothesis");
    await expect(page.locator('.dp-landing-window [data-shown="false"]')).toHaveCount(0);
  });

  test("the demo never empties its window when it starts over", async ({ page }) => {
    await page.goto("/welcome");
    const demo = page.locator(".dp-landing-window");
    const gap = page.locator(".dp-landing-gap");
    await demo.scrollIntoViewIfNeeded();
    await expect(gap).toHaveAttribute("data-shown", "true", { timeout: 15_000 });
    await expect(gap).toHaveAttribute("data-shown", "false", { timeout: 15_000 });
    await expect(page.locator('.dp-landing-step[data-shown="true"]')).not.toHaveCount(0);
  });

  test("circling the error with a mouse confirms the gap", async ({ page, isMobile }) => {
    test.skip(isMobile, "drawing needs a mouse drag");
    await page.goto("/welcome");
    const demo = page.locator(".dp-landing-window");
    const gap = page.locator(".dp-landing-gap");
    await demo.scrollIntoViewIfNeeded();
    await demo.locator(".dp-landing-window-bar").click();
    await expect(demo).toHaveAttribute("data-playing", "false");
    if ((await gap.getAttribute("data-decision")) === "confirmed") {
      await gap.getByRole("button", { name: "Отменить подтверждение" }).click();
    }
    await expect(gap).toHaveAttribute("data-decision", "hypothesis");
    const wrongStep = page.locator(".dp-landing-step.is-wrong");
    await expect(wrongStep).toHaveCSS("opacity", "1");
    await expect(wrongStep).toHaveCSS("translate", "none");

    const box = await page.locator(".dp-landing-wrong-formula").boundingBox();
    if (!box) throw new Error("formula is not on screen");
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    await page.mouse.move(box.x - 10, centerY);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width + 10, centerY, { steps: 12 });
    await page.mouse.up();
    await expect(gap).toHaveAttribute("data-decision", "hypothesis");

    const radiusX = box.width / 2 + 24;
    const radiusY = box.height / 2 + 14;
    await page.mouse.move(centerX + radiusX, centerY);
    await page.mouse.down();
    for (let index = 1; index <= 32; index += 1) {
      const angle = (index / 32) * Math.PI * 2;
      await page.mouse.move(
        centerX + Math.cos(angle) * radiusX,
        centerY + Math.sin(angle) * radiusY,
      );
    }
    await page.mouse.up();
    await expect(gap).toHaveAttribute("data-decision", "confirmed");
    await expect(gap.getByRole("heading", { name: "Пробел подтверждён" })).toBeVisible();
  });

  test("the map moves its focus and draws the path to the gap", async ({ page, isMobile }) => {
    test.skip(isMobile, "links are hidden on a narrow screen");
    await page.goto("/welcome");
    const map = page.locator(".dp-landing-map");
    await map.scrollIntoViewIfNeeded();
    await expect(page.locator('[data-node="powers"] .dp-landing-node-focus')).toHaveCount(1, {
      timeout: 10_000,
    });
    await expect(page.locator(".dp-landing-map-links > g")).toHaveCount(4);
    await page.locator('[data-node="logs"]').hover();
    await expect(page.locator('.dp-landing-map-links > g[data-active="true"]')).toHaveCount(1);
  });

  test("the topic ribbon moves and can be stopped", async ({ page }) => {
    await page.goto("/welcome");
    const track = page.locator(".dp-landing-marquee-track");
    await page.locator(".dp-landing-marquee").scrollIntoViewIfNeeded();
    const offset = () => track.evaluate((element) => getComputedStyle(element).transform);
    const first = await offset();
    await expect.poll(offset).not.toBe(first);

    const toggle = page.getByRole("button", { name: "Остановить ленту" });
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    const stopped = await offset();
    await page.waitForTimeout(400);
    expect(await offset()).toBe(stopped);
  });

  test("smooth scrolling, the progress line and magnetic buttons", async ({ page, isMobile }) => {
    await page.goto("/welcome");
    const progress = page.locator(".dp-landing-progress");
    const scale = () =>
      progress.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).a);
    await page.locator(".dp-landing-final").scrollIntoViewIfNeeded();
    await expect.poll(scale).toBeGreaterThan(0.9);
    if (isMobile) {
      await expect(page.locator("html")).not.toHaveClass(/lenis/);
      return;
    }
    await expect(page.locator("html")).toHaveClass(/lenis/);

    await page.evaluate(() => window.scrollTo(0, 0));
    const button = page.locator(".dp-landing-hero .dp-landing-magnet");
    const shift = () =>
      button.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).e);
    const box = await button.boundingBox();
    if (!box) throw new Error("button is not on screen");
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2, { steps: 4 });
    await expect.poll(shift).toBeGreaterThan(2);
    await page.mouse.move(box.x + box.width + 200, box.y + 200, { steps: 4 });
    await expect.poll(shift).toBeLessThan(0.5);
  });

  test("the lamp follows a mouse and stays off on a touch screen", async ({ page, isMobile }) => {
    await page.goto("/welcome");
    const hero = page.locator(".dp-landing-hero");
    const lamp = page.locator(".dp-landing-lamp");
    const sheet = page.locator(".dp-landing-sheet");
    if (isMobile) {
      await hero.tap({ position: { x: 40, y: 40 } });
      await expect(lamp).not.toHaveAttribute("data-on");
      await expect(sheet).not.toHaveAttribute("style", /rotateY/);
      return;
    }
    await hero.hover({ position: { x: 900, y: 200 } });
    await hero.hover({ position: { x: 1000, y: 260 } });
    await expect(lamp).toHaveAttribute("data-on", "true");
    await expect(sheet).toHaveAttribute("style", /rotate/);
  });
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
