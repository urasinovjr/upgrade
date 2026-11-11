import { expect, test } from "./onboarding";
import { readFile } from "node:fs/promises";

test("navigation opens at the top, keeps filters still and restores the previous scroll", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/works");
  const search = page.getByRole("textbox", { name: "Поиск работ" });
  await search.focus();
  await page.evaluate(() => scrollTo(0, 300));
  await search.fill(" ");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(300);
  await page.getByRole("link", { name: /Уравнения и преобразования/ }).click();
  await expect(page.locator("h1")).toHaveText("Уравнения и преобразования");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.evaluate(() => scrollTo(0, 900));
  await page.getByRole("navigation").getByRole("link", { name: "Ученики", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Ученики");
  await expect.poll(() => page.evaluate(() => scrollY)).toBe(0);
  await page.goBack();
  await expect(page.locator("h1")).toHaveText("Уравнения и преобразования");
  await expect.poll(() => page.evaluate(() => Math.abs(scrollY - 900))).toBeLessThan(2);
});

test("first uploaded image and PDF fit the preview at 100 percent after resizing", async ({
  page,
}) => {
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.locator(".source-image")).toBeVisible();
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.pdf");
  await expect(
    page.getByRole("combobox", { name: "Оригинал работы" }).locator("option"),
  ).toHaveCount(2);
  for (const width of [390, 1440, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(async () =>
        page
          .locator(".media-canvas")
          .evaluate((el) =>
            Math.abs(el.querySelector("img")!.getBoundingClientRect().width - el.clientWidth),
          ),
      )
      .toBeLessThan(2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  }
  const originals = page.getByRole("combobox", { name: "Оригинал работы" });
  const pdfId = await originals
    .locator("option")
    .filter({ hasText: "solution.pdf" })
    .getAttribute("value");
  await originals.selectOption(pdfId!);
  await expect(page.locator(".react-pdf__Page canvas")).toBeVisible();
  await expect
    .poll(async () =>
      page
        .locator(".media-canvas")
        .evaluate((el) =>
          Math.abs(el.querySelector("canvas")!.getBoundingClientRect().width - el.clientWidth),
        ),
    )
    .toBeLessThan(2);
});

test("conditions and task changes are protected on leaving homework", async ({
  page,
}, testInfo) => {
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  const condition = page.getByRole("textbox", { name: "Текст для распознавания" });
  await condition.click();
  await condition.fill("Решите уравнение x² = 4");
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Проверка", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Продолжить редактирование" }).click();
  await expect(condition).toHaveValue("Решите уравнение x² = 4");
  if (testInfo.project.name === "chromium") {
    const prompt = page.waitForEvent("dialog");
    const reload = page.reload({ timeout: 2000 }).catch(() => null);
    const native = await prompt;
    expect(native.type()).toBe("beforeunload");
    await native.dismiss();
    await reload;
    await expect(condition).toHaveValue("Решите уравнение x² = 4");
  }
  await condition.fill("");
  await page.getByRole("button", { name: "Сверить задания" }).click();
  await page.getByRole("button", { name: "Добавить задание", exact: true }).click();
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Проверка", exact: true })
    .click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Выйти", exact: true }).click();
  await expect(page).toHaveURL(/\/works$/);
});

test("focused controls and math keyboard stay above the fixed action panel", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 640 });
  await page.goto("/works/demo-ready");
  const input = page.getByRole("textbox", { name: "Комментарий для ученика" });
  await input.focus();
  await expect
    .poll(async () => {
      const field = await input.boundingBox();
      const footer = await page.locator(".review-footer").boundingBox();
      return field!.y >= 0 && field!.y + field!.height < footer!.y;
    })
    .toBe(true);
  const buttons = page.locator(".step-top button:visible");
  expect(await buttons.count()).toBeGreaterThan(0);
  for (const button of await buttons.all()) {
    const box = await button.boundingBox();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
  }
  const positions = await page.evaluate(() => {
    const footer = document.querySelector(".review-footer")!.getBoundingClientRect();
    const nav = document.querySelector(".sidebar")!.getBoundingClientRect();
    return { footerBottom: footer.bottom, navTop: nav.top, navBottom: nav.bottom };
  });
  expect(positions.footerBottom).toBeLessThanOrEqual(positions.navTop + 1);
  expect(positions.navBottom).toBeLessThanOrEqual(640 + 1);
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  const dialog = page.getByRole("dialog");
  const formula = dialog.locator("math-field");
  await formula.focus();
  await formula.locator('[part="virtual-keyboard-toggle"]').click();
  const insets = () =>
    page.evaluate(() => {
      const styles = getComputedStyle(document.documentElement);
      return [
        parseFloat(styles.getPropertyValue("--dialog-keyboard-height")),
        parseFloat(styles.getPropertyValue("--keyboard-height") || "0"),
      ];
    });
  await expect.poll(async () => (await insets())[0]).toBeGreaterThan(0);
  expect((await insets())[1]).toBe(0);
  const keyboard = dialog.locator(".ML__keyboard");
  await expect(keyboard).toBeVisible();
  const fieldAboveKeys = async (limit: number) => {
    const field = (await formula.boundingBox())!;
    const keys = (await keyboard.locator(".MLK__layer.is-visible").boundingBox())!;
    return field.y >= 0 && field.y + field.height <= keys.y + 1 && keys.y + keys.height <= limit;
  };
  await expect.poll(() => fieldAboveKeys(641)).toBe(true);
  const cancel = async () =>
    expect(async () => {
      if (await dialog.count())
        await dialog.getByRole("button", { name: "Отмена" }).click({ timeout: 2_000 });
      await expect(dialog).toHaveCount(0, { timeout: 2_000 });
    }).toPass();
  await cancel();
  await page.setViewportSize({ width: 720, height: 406 });
  await expect(page.locator(".review-footer")).toHaveCSS("position", "static");
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  await formula.focus();
  await formula.locator('[part="virtual-keyboard-toggle"]').click();
  await expect(keyboard).toBeVisible();
  await expect.poll(() => fieldAboveKeys(Infinity)).toBe(true);
  const targets = await keyboard
    .locator(".MLK__layer.is-visible .MLK__row > div:not(.separator)")
    .evaluateAll((keys) =>
      keys.map((key) => ({
        width: key.getBoundingClientRect().width,
        height: key.getBoundingClientRect().height,
      })),
    );
  expect(targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  const apply = dialog.getByRole("button", { name: "Сохранить шаг" });
  await expect(async () => {
    await apply.scrollIntoViewIfNeeded();
    await expect(apply).toBeInViewport({ timeout: 500 });
  }).toPass();
  await cancel();
  const comment = page.getByRole("textbox", { name: "Что дальше" });
  await comment.focus();
  await expect
    .poll(async () =>
      comment.evaluate((el) => {
        const field = el.getBoundingClientRect();
        return field.top >= 0 && field.bottom <= innerHeight;
      }),
    )
    .toBe(true);
});

test("long names, goals, work titles and filenames remain readable", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await page.goto("/students");
  await page.getByRole("button", { name: "Добавить ученика" }).click();
  const name = "Анастасия-Александра".repeat(7);
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Имя ученика" }).fill(name);
  await dialog
    .getByRole("textbox", { name: "Цель занятий" })
    .fill("Подготовка к экзамену и повторение алгебры. ".repeat(12));
  await dialog.getByRole("button", { name: "Сохранить ученика" }).click();
  const card = page.locator(".student-card").filter({ has: page.getByRole("heading", { name }) });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.locator("h1")).toHaveText(name);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  const title = "КонтрольнаяРаботаПоПреобразованиюВыражений".repeat(8).slice(0, 200);
  await page.getByRole("textbox", { name: "Название ДЗ", exact: true }).fill(title);
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles({
    name: "решение_".repeat(20) + ".png",
    mimeType: "image/png",
    buffer: await readFile("e2e/fixtures/solution.png"),
  });
  await expect(page.locator(".source-image")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.locator("h1")).toHaveText(title);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("link", { name: "Все ДЗ", exact: true }).click();
  await expect(page.locator(".hw-list strong").filter({ hasText: title })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

for (const width of [1440, 1024, 390]) {
  test(`the active section and its count stay readable at ${width}px`, async ({ page }) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width, height: 900 });
    for (const [title, heading] of [
      ["Обзор", "Обзор"],
      ["ДЗ", "Домашние задания"],
      ["Проверка", "Проверка"],
      ["Ученики", "Ученики"],
    ]) {
      await page.goto("/dashboard");
      const link = page.getByRole("navigation").getByRole("link", { name: title, exact: true });
      await link.click();
      await expect(page.locator("h1")).toHaveText(heading);
      await expect(link).toHaveAttribute("aria-current", /page|true/);
      await expect(link).toHaveClass(/active/);
    }
    const count = page
      .getByRole("navigation")
      .getByRole("link", { name: "Проверка", exact: true })
      .locator(".dp-nav-count");
    await page.goto("/works");
    await expect(count).toBeVisible();
    const contrast = await count.evaluate((element) => {
      const channels = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 4).map(Number);
      const luminance = (rgb: number[]) => {
        const [red, green, blue] = rgb.map((value) => {
          const channel = value / 255;
          return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
      };
      let background = [255, 255, 255];
      for (let node: Element | null = element; node; node = node.parentElement) {
        const color = channels(getComputedStyle(node).backgroundColor);
        if ((color[3] ?? 1) > 0.9) {
          background = color.slice(0, 3);
          break;
        }
      }
      const text = luminance(channels(getComputedStyle(element).color));
      const fill = luminance(background);
      return (Math.max(text, fill) + 0.05) / (Math.min(text, fill) + 0.05);
    });
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });
}

test("keyboard focus is visible on the navigation links", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/dashboard");
  const links = page.getByRole("navigation").getByRole("link");
  await links.first().focus();
  for (const link of await links.all()) {
    await link.focus();
    const outline = await link.evaluate((element) => {
      const style = getComputedStyle(element);
      return { style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
    });
    expect(outline.style).not.toBe("none");
    expect(outline.width).toBeGreaterThanOrEqual(2);
  }
});

test("welcome page controls are large enough to tap on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/welcome");
  await expect(page.locator("h1")).toBeVisible();
  const small = await page
    .locator("main")
    .locator("button, a.dp-primary, a.dp-secondary, .dp-landing-cta a")
    .evaluateAll((elements) =>
      elements
        .filter((element) => element.getClientRects().length > 0)
        .map((element) => ({
          text: (element.textContent ?? "").trim().slice(0, 30),
          height: element.getBoundingClientRect().height,
        }))
        .filter((item) => item.height < 44),
    );
  expect(small).toEqual([]);
});
