import { expect, test } from "@playwright/test";

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the ink turns off quietly without WebGL", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (
        this: HTMLCanvasElement,
        type: string,
        ...rest: unknown[]
      ) {
        if (type.startsWith("webgl")) return null;
        return Reflect.apply(getContext, this, [type, ...rest]);
      } as typeof getContext;
    });
    await page.goto("/welcome");
    await expect(page.locator(".dp-landing-ink")).toHaveAttribute("data-ink", "off");
    expect(errors).toEqual([]);
  });

  test("the ink runs on screen and pauses when nobody sees it", async ({ page, isMobile }) => {
    test.skip(isMobile, "WebGL in the phone browser is not checked here");
    await page.goto("/welcome");
    const ink = page.locator(".dp-landing-ink");
    await expect(ink).toHaveAttribute("data-ink", "running", { timeout: 10_000 });

    await page.locator("#honest").scrollIntoViewIfNeeded();
    await expect(ink).toHaveAttribute("data-ink", "paused");
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(ink).toHaveAttribute("data-ink", "running");

    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect(ink).toHaveAttribute("data-ink", "paused");
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("there is no ink and no drifting light", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.locator(".dp-landing-ink")).toHaveCount(0);
    const glow = await page
      .locator(".dp-landing-honest")
      .evaluate((section) => getComputedStyle(section, "::before").content);
    expect(glow).toBe("none");
  });
});
