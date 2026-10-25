import { expect, type Page, test } from "@playwright/test";

async function scrollTrack(page: Page, progress: number) {
  await page.locator(".dp-journey-track").evaluate((track, value) => {
    const top = track.getBoundingClientRect().top + window.scrollY;
    const length = track.getBoundingClientRect().height - window.innerHeight;
    window.scrollTo(0, top + length * value);
  }, progress);
}

test.describe("with motion", () => {
  test.use({ reducedMotion: "no-preference" });

  test("the journey plays one stage after another while you scroll", async ({ page, isMobile }) => {
    test.skip(isMobile, "a touch screen gets the stacked cards");
    await page.goto("/welcome");
    const track = page.locator(".dp-journey-track");
    const current = page.locator('.dp-journey-steps li[aria-current="step"] h3');
    const stages = [
      { progress: 0.15, step: "1", title: "Загрузите работу" },
      { progress: 0.4, step: "2", title: "Проверьте шаги" },
      { progress: 0.65, step: "3", title: "Подтвердите пробел" },
      { progress: 0.9, step: "4", title: "Отправьте отчёт" },
    ];
    for (const stage of stages) {
      await scrollTrack(page, stage.progress);
      await expect(track).toHaveAttribute("data-step", stage.step);
      await expect(current).toHaveText(stage.title);
    }
    await expect(page.locator(".dp-journey-node.is-target")).toHaveAttribute("data-gap", "true");
    await expect(page.locator(".dp-journey-report")).toHaveAttribute("data-shown", "true");

    await scrollTrack(page, 0.15);
    await expect(track).toHaveAttribute("data-step", "1");
    await expect(page.locator(".dp-journey-report")).toHaveAttribute("data-shown", "false");
    await expect(page.locator(".dp-journey-stage")).toBeInViewport();
  });

  test("a touch screen gets the stacked cards", async ({ page, isMobile }) => {
    test.skip(!isMobile, "only a touch screen");
    await page.goto("/welcome");
    await expect(page.locator(".dp-journey-cards > li")).toHaveCount(4);
    await expect(page.locator(".dp-journey-track")).toHaveCount(0);
  });
});

test.describe("with reduced motion", () => {
  test.use({ reducedMotion: "reduce" });

  test("the journey is four cards drawn at once", async ({ page }) => {
    await page.goto("/welcome");
    await expect(page.locator("#how h2")).toHaveText("От фото тетради до отчёта родителям");
    await expect(page.locator(".dp-journey-cards > li")).toHaveCount(4);
    await expect(page.locator(".dp-journey-track")).toHaveCount(0);
    const cards = page.locator(".dp-journey-cards > li");
    await expect(cards.locator('.dp-journey-photo[data-placed="false"]')).toHaveCount(0);
    await expect(cards.locator('.dp-journey-redact[data-drawn="false"]')).toHaveCount(0);
    await expect(cards.nth(1).locator('.dp-journey-line[data-marked="false"]')).toHaveCount(0);
    await expect(cards.nth(2).locator(".dp-journey-gap")).toHaveAttribute("data-confirmed", "true");
    await expect(cards.nth(2).locator(".dp-journey-node.is-target")).toHaveAttribute(
      "data-gap",
      "true",
    );
    await expect(cards.nth(3).locator(".dp-journey-sent")).toHaveAttribute("data-shown", "true");
  });
});
