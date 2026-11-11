import AxeBuilder from "@axe-core/playwright";
import { test, expect, writeDemo } from "./onboarding";
import { seedState } from "../src/data/fixtures";

for (const width of [320, 390]) {
  test(`queue labels remain whole with a scrollbar at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/dashboard");
    await page.addStyleTag({ content: "html { overflow-y: scroll; scrollbar-gutter: stable; }" });
    const buttons = page.getByRole("group", { name: "Фильтр работ" }).getByRole("button");
    await expect(buttons).toHaveCount(3);
    await page.evaluate(() => document.fonts.ready);
    const broken = await buttons.evaluateAll((items) =>
      items.flatMap((button) => {
        const label = button.querySelector(".dp-segment-label")!;
        const node = label.firstChild!;
        return [...(node.textContent ?? "").matchAll(/\S+/g)]
          .filter((match) => {
            const range = document.createRange();
            range.setStart(node, match.index);
            range.setEnd(node, match.index + match[0].length);
            return new Set([...range.getClientRects()].map((box) => Math.round(box.y))).size > 1;
          })
          .map((match) => match[0]);
      }),
    );
    expect(broken).toEqual([]);
    await page.screenshot({ path: testInfo.outputPath("queue-" + width + ".png") });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
}

for (const [route, title] of [
  ["students", "учеников"],
  ["works", "работы"],
  ["dashboard", "обзор"],
  ["students/anna?tab=map", "карточку ученика"],
]) {
  test(`load error names ${route} and recovers`, async ({ page }) => {
    await page.addInitScript(() => {
      const original = IDBObjectStore.prototype.get;
      Object.defineProperty(window, "failStateRead", { value: true, writable: true });
      IDBObjectStore.prototype.get = function (...args) {
        if (this.name === "state" && Reflect.get(window, "failStateRead"))
          throw new Error("storage_unavailable");
        return original.apply(this, args);
      };
    });
    await page.goto("/" + route);
    await expect(
      page.getByRole("heading", { name: "Не удалось загрузить " + title }),
    ).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);
    await page.evaluate(() => Reflect.set(window, "failStateRead", false));
    await page.getByRole("button", { name: "Попробовать ещё раз" }).click();
    await expect(page.getByRole("button", { name: "Попробовать ещё раз" })).toHaveCount(0);
    await expect(page.locator("h1")).toHaveCount(1);
  });
}

test("formula input has one named focus stop and respects disabled state", async ({ page }) => {
  await page.goto("/e2e/fixtures/formula.html");
  const input = page.getByRole("textbox", { name: "Формула", exact: true });
  const before = page.getByRole("textbox", { name: "До формулы" });
  const toggle = page.getByRole("button", { name: "Доступность ввода" });
  const after = page.getByRole("textbox", { name: "После формулы" });
  const waitForFocus = async () => {
    await expect(input).toBeFocused();
    await expect
      .poll(() =>
        page
          .locator("math-field")
          .evaluate(
            (element) =>
              (element as HTMLElement & { _mathfield?: { focusBlurInProgress: boolean } })
                ._mathfield?.focusBlurInProgress,
          ),
      )
      .toBe(false);
    await expect(input).toBeFocused();
  };
  await before.focus();
  await page.keyboard.press("Tab");
  await waitForFocus();
  await page.keyboard.type("x=3");
  await expect(page.locator("math-field")).toHaveJSProperty("value", "x=3");
  await page.keyboard.press("Tab");
  await expect(after).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await waitForFocus();
  for (let index = 0; index < 5; index += 1) {
    await page.keyboard.press("Tab");
    await expect(after).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await waitForFocus();
  }
  const violations = (await new AxeBuilder({ page }).analyze()).violations.filter((item) =>
    ["serious", "critical"].includes(item.impact ?? ""),
  );
  expect(violations).toEqual([]);
  await toggle.click();
  await expect(input).toHaveAttribute("aria-disabled", "true");
  await before.focus();
  await page.keyboard.press("Tab");
  await expect(after).toBeFocused();
  await input.evaluate((element) => (element as HTMLElement).focus());
  await page.keyboard.type("9");
  await expect(page.locator("math-field")).toHaveJSProperty("value", "x=3");
  await toggle.click();
  await before.focus();
  await page.keyboard.press("Tab");
  await waitForFocus();
});

test("compact keyboard preserves pages, targets and shared configuration", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/e2e/fixtures/formula.html");
  await page.getByRole("textbox", { name: "Формула", exact: true }).focus();
  await page.locator('math-field [part="virtual-keyboard-toggle"]').click();
  const layer = page.locator(".MLK__layer.is-visible");
  await expect(layer).toBeVisible();
  for (const key of ["x", "=", "3"])
    await layer.locator(`.MLK__keycap[aria-label="${key}"]`).click();
  await expect(page.locator("math-field")).toHaveJSProperty("value", "x=3");
  const layouts = await page.evaluate(() => window.mathVirtualKeyboard.normalizedLayouts);
  const violations = (
    await new AxeBuilder({ page }).include(".ML__keyboard").analyze()
  ).violations.filter((item) => ["serious", "critical"].includes(item.impact ?? ""));
  expect(violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath("compact-keyboard.png") });
  expect(layouts.map((layout) => layout.label)).toEqual(["Цифры", "Формулы", "Буквы"]);
  for (const layout of layouts)
    for (const pageLayer of layout.layers) {
      expect(pageLayer.rows!.length).toBeLessThanOrEqual(4);
      expect(Math.max(...pageLayer.rows!.map((row) => row.length))).toBeLessThanOrEqual(5);
      await page.evaluate(
        (id) => window.mathVirtualKeyboard.executeCommand(["switchKeyboardLayer", id]),
        pageLayer.id!,
      );
      const boxes = await layer.locator(".MLK__keycap").evaluateAll((keys) =>
        keys.map((key) => ({
          width: key.getBoundingClientRect().width,
          height: key.getBoundingClientRect().height,
        })),
      );
      expect(boxes.every((box) => box.width >= 44 && box.height >= 44)).toBe(true);
    }
  await layer.locator(".MLK__toolbar").getByText("Формулы", { exact: true }).click();
  await expect(layer).toHaveAttribute("id", "formulas-0");
  await layer.locator('[data-tooltip="Следующая страница"]').click();
  await expect(layer).toHaveAttribute("id", "formulas-1");
  await layer.locator('[data-tooltip="Предыдущая страница"]').click();
  await expect(layer).toHaveAttribute("id", "formulas-0");
  await layer.locator(".MLK__toolbar").getByText("Цифры", { exact: true }).click();
  const variable = (await layer.locator('.MLK__keycap[aria-label="x"]').boundingBox())!;
  await page.mouse.move(variable.x + variable.width / 2, variable.y + variable.height / 2);
  await page.mouse.down();
  const variants = page.locator(".MLK__variant-panel.is-visible");
  await expect(variants).toBeVisible();
  const targets = await variants.locator(".item").evaluateAll((items) =>
    items.map((item) => ({
      width: item.getBoundingClientRect().width,
      height: item.getBoundingClientRect().height,
    })),
  );
  expect(targets.length).toBeGreaterThan(0);
  expect(targets.every((target) => target.width >= 44 && target.height >= 44)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("compact-variants.png") });
  await page.mouse.up();
  await page.setViewportSize({ width: 900, height: 700 });
  await expect
    .poll(() => page.evaluate(() => window.mathVirtualKeyboard.layouts))
    .toEqual(["numeric", "symbols", "alphabetic", "greek"]);
  await page.setViewportSize({ width: 390, height: 640 });
  await expect
    .poll(() => page.evaluate(() => window.mathVirtualKeyboard.normalizedLayouts[0].label))
    .toBe("Цифры");
  await page.getByRole("button", { name: "Показать поле" }).click();
  await expect.poll(() => page.evaluate(() => window.mathVirtualKeyboard.visible)).toBe(false);
  await expect
    .poll(() => page.evaluate(() => window.mathVirtualKeyboard.layouts))
    .toEqual(["numeric", "symbols", "alphabetic", "greek"]);
});

test("PDF blocks invalid formulas in the selected published version", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("h1")).toBeVisible();
  const state = seedState(Date.now());
  const work = state.works.find((item) => item.id === "demo-confirmed")!;
  const selected = work.published.find((revision) => revision.id === work.currentPublishedId)!;
  selected.draft.tasks[0].steps[0].latex = "x=\\unknownUpgradeCommand";
  await writeDemo(page, "state", "root", state);
  await page.goto("/works/demo-confirmed/report");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("шаг 1");
  await expect(page.getByRole("alert")).toContainText(selected.draft.tasks[0].title);
  await page.getByRole("link", { name: "Исправить формулу" }).click();
  await expect(page).toHaveURL(new RegExp("task=" + selected.draft.tasks[0].id));
});

test("archive formula validation uses the selected revision and preserves saved formulas", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  await page.goto("/dashboard");
  await expect(page.locator("h1")).toBeVisible();
  const state = seedState(Date.now());
  const work = state.works.find((item) => item.id === "demo-confirmed")!;
  const archived = work.published.find((revision) => revision.id === work.currentPublishedId)!;
  archived.draft.tasks[0].formula = "\\unknownUpgradeCommand";
  const current = structuredClone(archived);
  current.id = "valid-current";
  current.number = archived.number + 1;
  current.draft.tasks[0].formula = "x^2=4";
  work.published.push(current);
  work.currentPublishedId = current.id;
  await writeDemo(page, "state", "root", state);
  await page.goto("/works/demo-confirmed/report?revision=" + archived.id);
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await expect(page.getByRole("alert")).toContainText("условие");
  await expect(page.getByRole("alert")).toContainText("Архивную версию изменить нельзя");
  await expect(page.getByRole("link", { name: "К новой версии" })).toBeVisible();
  await page.goto("/works/demo-confirmed/report");
  await expect(page.locator(".dp-window-meta")).toContainText("версия " + current.number);
  const downloading = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toBe("UpGrade-report-v" + current.number + ".pdf");
  await download.saveAs(testInfo.outputPath("selected-version.pdf"));
  await expect(page.locator(".formula .ML__error")).toHaveCount(0);
  await page.goto("/works/demo-confirmed/report?revision=" + archived.id);
  await expect(page.getByText(/Не удалось отобразить формулу:/)).toBeVisible();
});

test("mixed prose keeps spaces and damaged formulas keep the report open", async ({ page }) => {
  await page.goto("/dashboard");
  const state = seedState(Date.now());
  const work = state.works.find((item) => item.id === "demo-confirmed")!;
  const revision = work.published.find((item) => item.id === work.currentPublishedId)!;
  revision.draft.tasks[0].steps[0].latex = "По теореме $x^2=4$\nОтвет: \\(x=2\\) и \\(x=-2\\).";
  revision.draft.tasks[0].formula = "$x=2";
  await writeDemo(page, "state", "root", state);
  await page.goto("/works/demo-confirmed/report");
  await expect(page.getByRole("heading", { name: "Отчёт по работе", exact: true })).toBeVisible();
  await expect(
    page.getByText("Не удалось отобразить формулу: $x=2", { exact: true }),
  ).toBeVisible();
  const prose = page.locator('.formula[data-latex^="По теореме"]');
  await expect(prose).toContainText("По теореме ");
  await expect(prose).toContainText("Ответ: ");
  await expect(prose.locator(".formula-part")).toHaveCount(3);
});
