import { expect, readDemoWork, test } from "./onboarding";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test(
  "review → confirmation → report/PDF → versions → gap closure",
  { tag: ["@prd-09", "@prd-11", "@prd-12"] },
  async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/works");
    await expect(page.getByRole("heading", { name: "Проверка", exact: true })).toBeVisible();
    await page.getByRole("textbox", { name: "Поиск работ" }).fill("несуществующая");
    await expect(page.getByText("Работы не найдены")).toBeVisible();
    await page.getByRole("button", { name: "Сбросить фильтры" }).click();
    await page.getByRole("link", { name: /Уравнения и преобразования/ }).click();
    await expect(
      page.getByRole("button", { name: "Опубликовать результат", exact: true }),
    ).toBeDisabled();
    const firstTask = page.getByRole("tab", { name: "Задача 1", exact: true });
    const secondTask = page.getByRole("tab", { name: "Задача 2", exact: true });
    await expect(secondTask).toHaveAttribute("aria-selected", "true");
    await firstTask.click();
    await expect(firstTask).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Отметить проверенной" }).click();
    await secondTask.click();
    await expect(secondTask).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Подтвердить гипотезу", exact: true }).click();
    await page.getByRole("button", { name: "Отметить проверенной" }).click();
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 1 опубликована")).toBeVisible();
    await page.reload();
    await expect(page.getByText("Версия 1 опубликована")).toBeVisible();
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await expect(page.getByText("Отчёт по работе", { exact: true })).toBeVisible();
    const downloadPromise = page.waitForEvent("download");
    await page.getByRole("button", { name: "Скачать PDF" }).click();
    const download = await downloadPromise;
    await mkdir("../output/pdf", { recursive: true });
    await download.saveAs(path.resolve("../output/pdf/report-" + testInfo.project.name + ".pdf"));
    await page.getByRole("link", { name: "К разбору работы" }).click();
    await page.getByRole("button", { name: "Начать новую версию" }).click();
    await page.getByRole("textbox", { name: "Что дальше" }).fill("Проверка сохранения черновика.");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Что дальше" })).toHaveValue(
      "Проверка сохранения черновика.",
    );
    await firstTask.click();
    await expect(firstTask).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Отметить проверенной" }).click();
    await secondTask.click();
    await expect(secondTask).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Отметить проверенной" }).click();
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 2 опубликована")).toBeVisible();
    await page.getByRole("link", { name: "Ученики", exact: true }).click();
    await page
      .getByRole("main")
      .getByRole("link", { name: /Анна Соколова/ })
      .click();
    await expect(
      page.getByRole("list", { name: "Основания пробела", exact: true }).getByRole("listitem"),
    ).toHaveCount(2);
    await page.getByRole("button", { name: "Закрыть пробел", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Почему пробел закрыт" })
      .fill("Три аналогичные задачи решены самостоятельно.");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Закрыть пробел", exact: true })
      .click();
    await expect(page.locator(".dp-student-gap.is-closed")).toContainText("Пробел закрыт");
    await page.reload();
    await expect(page.locator(".dp-student-gap.is-closed")).toContainText("Пробел закрыт");
    await page.getByRole("button", { name: "Открыть пробел снова" }).click();
    await expect(page.getByText("Открытый пробел", { exact: true })).toBeVisible();
    await page.getByText("История изменений · 2").click();
    await expect(page.getByText("Пробел открыт снова", { exact: true })).toBeVisible();
    await expect(page.getByText("Три аналогичные задачи решены самостоятельно.")).toBeVisible();
    expect(errors).toEqual([]);
  },
);

test(
  "original, formula edit, stale state and simulated job survive reload",
  { tag: ["@prd-06"] },
  async ({ page }, testInfo) => {
    await page.goto("/works/demo-ready");
    const originalTab = page.getByRole("tab", { name: "Оригинал", exact: true });
    if (testInfo.project.name.includes("mobile")) await originalTab.click();
    await expect(page.getByAltText("Оригинал: Учебный пример.svg")).toBeVisible();
    await page.getByRole("button", { name: "Обрезать" }).click();
    const left = page.getByRole("spinbutton", { name: "Слева", exact: true });
    await left.fill("2");
    await left.press("0");
    await expect(left).toBeFocused();
    await expect(left).toHaveValue("20");
    await page.getByRole("button", { name: "Сохранить обрезку" }).click();
    await expect(page.getByText("Данные не проверены", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Отметить: данные скрыты" }).click();
    await expect(page.getByText("Данные скрыты", { exact: true })).toBeVisible();
    if (testInfo.project.name.includes("mobile"))
      await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await expect(
      page.getByText("Сверьте распознанное с оригиналом", { exact: true }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Всё сверено" }).click();
    await expect(page.getByText("Сверьте распознанное с оригиналом", { exact: true })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "Изменить шаг 1" }).click();
    const math = page.getByRole("dialog").locator('math-field[aria-label="Формула шага 1"]');
    await math.evaluate((element) => {
      const field = element as HTMLElement & { value: string };
      field.value = "(x-2)(x-3)=0";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await page.getByRole("button", { name: "Сохранить шаг" }).click();
    await expect(
      page.getByText("Сверьте распознанное с оригиналом", { exact: true }),
    ).toBeVisible();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    const previous = await readDemoWork(page, "demo-ready");
    await page.getByRole("button", { name: "Запустить разбор заново" }).click();
    await expect
      .poll(async () => {
        const work = await readDemoWork(page, "demo-ready");
        return Boolean(
          work.job &&
          work.job.token !== previous.job?.token &&
          work.job.inputRevision === previous.draft.inputRevision,
        );
      })
      .toBe(true);
    await page.reload();
    await expect
      .poll(
        async () => {
          const work = await readDemoWork(page, "demo-ready");
          return !work.job && work.draft.analysedInputRevision === previous.draft.inputRevision;
        },
        { timeout: 10_000 },
      )
      .toBe(true);
    await expect(page.getByText("К проверке", { exact: true })).toBeVisible({ timeout: 10000 });
  },
);

test(
  "masks hide personal data and every page is checked before analysis",
  { tag: ["@prd-15"] },
  async ({ page }, testInfo) => {
    const mobile = testInfo.project.name.includes("mobile");
    const toOriginal = () => page.getByRole("tab", { name: "Оригинал", exact: true }).click();
    const toReview = () => page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await page.goto("/works/demo-ready");
    if (mobile) await toOriginal();
    await expect(page.getByText("Данные скрыты", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Закрасить данные" }).click();
    await page.getByRole("spinbutton", { name: "Ширина", exact: true }).fill("40");
    await page.getByRole("button", { name: "Закрасить область" }).click();
    await expect(page.getByText(/^Область 1: 0% слева, 0% сверху, 40×8%/)).toBeVisible();
    await expect(page.locator(".mask-box")).toHaveCount(1);
    await expect(page.getByText("Данные не проверены", { exact: true })).toBeVisible();
    await expect(page.getByText("Данные скрыты: 0 из 1 стр.")).toBeVisible();
    if (!mobile) {
      const layer = await page.getByTestId("mask-layer").boundingBox();
      expect(layer).not.toBeNull();
      await page.mouse.move(layer!.x + layer!.width * 0.5, layer!.y + 20);
      await page.mouse.down();
      await page.mouse.move(layer!.x + layer!.width * 0.8, layer!.y + 70, { steps: 4 });
      await page.mouse.up();
      await expect(page.locator(".mask-box")).toHaveCount(2);
    }
    if (mobile) await toReview();
    const reanalyse = page.getByRole("button", { name: "Запустить разбор заново" });
    await expect(reanalyse).toBeDisabled();
    await expect(page.getByText("Отметьте «Данные скрыты» ещё на 1 стр. оригинала")).toBeVisible();
    if (mobile) await toOriginal();
    await page.getByRole("button", { name: "Отметить: данные скрыты" }).click();
    await expect(page.getByText("Данные скрыты: 1 из 1 стр.")).toBeVisible();
    if (mobile) await toReview();
    await expect(reanalyse).toBeEnabled();
    await page.reload();
    if (mobile) await toOriginal();
    await expect(page.locator(".mask-box")).toHaveCount(mobile ? 1 : 2);
    await expect(page.getByText("Данные скрыты", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Закрасить данные" }).click();
    await page.getByRole("button", { name: "Удалить область 1" }).click();
    await expect(page.locator(".mask-box")).toHaveCount(mobile ? 0 : 1);
    await expect(page.getByText("Данные не проверены", { exact: true })).toBeVisible();
  },
);

test("a recognized step opens its place in the original", async ({ page }, testInfo) => {
  await page.goto("/works/demo-ready");
  await page.getByRole("button", { name: "Показать шаг 1 в оригинале" }).click();
  await expect(page.locator(".focus-box")).toBeVisible();
  await expect(page.getByText("Шаг здесь")).toBeInViewport();
  if (testInfo.project.name.includes("mobile"))
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
  await expect(page.getByText("Нет привязки к странице")).toHaveCount(0);
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  await page
    .getByRole("dialog")
    .locator('math-field[aria-label="Формула шага 1"]')
    .evaluate((element) => {
      const field = element as HTMLElement & { value: string };
      field.value = "\\sqrt{y}=7";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Сохранить шаг" }).click();
  await expect(page.getByText("Запись изменена после распознавания")).toHaveCount(1);
  await page.getByRole("button", { name: "Отвязать шаг 2 от оригинала" }).click();
  await expect(page.getByRole("button", { name: "Показать шаг 2 в оригинале" })).toHaveCount(0);
  await expect(page.getByText("Нет привязки к странице")).toHaveCount(1);
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Нет привязки к странице")).toHaveCount(1);
});

test("homework rejects corrupted originals and preserves manual conditions", async ({ page }) => {
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page
    .getByLabel("Добавить фотографии или PDF")
    .setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await expect(page.getByRole("alert")).toContainText("повреждено");
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.locator(".source-image")).toBeVisible();
  await page.getByRole("button", { name: "Сверить задания" }).click();
  await page.getByRole("button", { name: "Добавить задание", exact: true }).click();
  await page.getByRole("textbox", { name: "Условие", exact: true }).fill("Решите x + 1 = 2");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Условие", exact: true })).toHaveValue(
    "Решите x + 1 = 2",
  );
});

for (const width of [320, 390, 700, 701, 768, 900, 901, 1024, 1199, 1200, 1201, 1440, 1920]) {
  test("all screens remain contained at " + width + "px", async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await mkdir("../output/playwright", { recursive: true });
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "dashboard",
      "works",
      "works/new",
      "works/demo-ready",
      "students",
      "students/anna",
      "works/demo-confirmed/report",
      "dev/states",
      "unknown",
    ]) {
      await page.goto("/" + route);
      await expect(page.locator("h1")).toBeVisible({ timeout: 15_000 });
      await page.evaluate(() => document.fonts.ready);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      const outside = await page
        .locator(".page-header,.review-header,.student-header,.review-footer,.new-work-submit")
        .evaluateAll((elements) =>
          elements
            .filter((el) => {
              const box = el.getBoundingClientRect();
              return box.left < -1 || box.right > innerWidth + 1;
            })
            .map((el) => el.className),
        );
      expect(outside, route + " at " + width).toEqual([]);
      if (route === "works/demo-ready")
        for (const hook of [".review-header", ".review-footer"])
          expect(await page.locator(hook).count(), hook).toBeGreaterThan(0);
      if (route === "students/anna")
        expect(await page.locator(".student-header").count(), ".student-header").toBe(1);
      if ([390, 1024, 1440, 1920].includes(width))
        await page.screenshot({
          path:
            "../output/playwright/polish-" +
            testInfo.project.name +
            "-" +
            route.replaceAll("/", "-") +
            "-" +
            width +
            ".png",
          fullPage: true,
        });
    }
    expect(errors).toEqual([]);
  });
}

test(
  "multi-page PDF, image condition, page order and student creation",
  { tag: ["@prd-01"] },
  async ({ page }) => {
    await page.goto("/works/new");
    await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
    await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.pdf");
    await page.getByRole("combobox", { name: "Страница оригинала" }).selectOption("2");
    await expect(page.locator(".react-pdf__Page canvas")).toBeVisible();
    await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.png");
    await expect(
      page.getByRole("combobox", { name: "Оригинал работы" }).locator("option"),
    ).toHaveCount(2);
    await page.reload();
    await expect(
      page.getByRole("combobox", { name: "Оригинал работы" }).locator("option"),
    ).toHaveCount(2);
  },
);

test(
  "saving failure keeps edits; keyboard dialog and withdrawal preserve history",
  { tag: ["@prd-07", "@prd-10"] },
  async ({ page, context, browserName }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/works/demo-confirmed");
    await page.getByRole("button", { name: "Начать новую версию" }).click();
    await expect(page.getByRole("textbox", { name: "Что дальше" })).toBeVisible();
    await page.evaluate(() => {
      const original = IDBObjectStore.prototype.put;
      (window as Window & { restoreStorage?: () => void }).restoreStorage = () => {
        IDBObjectStore.prototype.put = original;
      };
      IDBObjectStore.prototype.put = function (...args: Parameters<typeof original>) {
        if (this.name === "state") throw new DOMException("Full", "QuotaExceededError");
        return original.apply(this, args);
      };
    });
    await page
      .getByRole("textbox", { name: "Что дальше" })
      .fill("Изменения должны сохраниться после повтора.");
    await expect(page.getByRole("alert")).toContainText("закончилось место");
    await page.evaluate(() =>
      (window as Window & { restoreStorage?: () => void }).restoreStorage?.(),
    );
    await page.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(page.getByRole("alert")).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("textbox", { name: "Что дальше" })).toHaveValue(
      "Изменения должны сохраниться после повтора.",
    );
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await expect(page.getByText("Изменения должны сохраниться после повтора.")).toHaveCount(0);
    if (browserName === "chromium")
      await context.grantPermissions(["clipboard-read", "clipboard-write"], {
        origin: "http://127.0.0.1:5173",
      });
    await page.getByRole("button", { name: "Скопировать текст" }).click();
    await expect(page.getByRole("button", { name: "Скопировано" })).toBeVisible();
    await page.getByRole("link", { name: "К разбору работы" }).click();
    const trigger = page.getByRole("button", { name: "Отозвать публикацию", exact: true });
    await trigger.focus();
    await page.keyboard.press("Enter");
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() => Boolean(document.activeElement?.closest('[role="dialog"]'))),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
    await trigger.click();
    await dialog.getByRole("button", { name: "Отозвать публикацию" }).click();
    await expect(page.getByRole("link", { name: "Отчёт, версия 1" })).toHaveCount(0);
    await page.getByText("История версий · 1").click();
    await page.getByRole("link", { name: "Версия 1 · архивная" }).click();
    await expect(
      page.getByText("Это старая версия отчёта. В карте знаний учтена более новая"),
    ).toBeVisible();
    expect(errors).toEqual([]);
  },
);

test("clipboard refusal and unavailable API provide selected confirmed text", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/works/demo-confirmed/report");
  for (const unavailable of [false, true]) {
    await page.evaluate((missing) => {
      Object.defineProperty(navigator, "clipboard", {
        configurable: true,
        value: missing
          ? undefined
          : { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) },
      });
    }, unavailable);
    const copy = page.getByRole("button", { name: "Скопировать текст", exact: true });
    await copy.focus();
    await page.keyboard.press("Enter");
    const field = page.getByRole("textbox", { name: "Текст отчёта" });
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(/Самостоятельная по рациональным дробям/);
    expect(
      await field.evaluate((element) => {
        const textarea = element as HTMLTextAreaElement;
        return textarea.selectionStart === 0 && textarea.selectionEnd === textarea.value.length;
      }),
    ).toBe(true);
    await expect(page.getByRole("button", { name: "Скопировано", exact: true })).toHaveCount(0);
    await page.keyboard.press("Escape");
    await expect(copy).toBeFocused();
  }
  expect(errors).toEqual([]);
});

test("an image condition cannot replace the student's solution", async ({ page }) => {
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.locator(".source-image")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отправить ДЗ целиком" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Запустить разбор" })).toHaveCount(0);
});

test("the review keeps its task in the URL and stays visible when leaving is cancelled", async ({
  page,
}) => {
  await page.goto("/works/demo-ready");
  const firstTask = page.getByRole("tab", { name: "Задача 1", exact: true });
  await firstTask.click();
  await expect(page).toHaveURL(/[?&]task=/);
  await page.reload();
  await expect(firstTask).toHaveAttribute("aria-selected", "true");
  await page.getByRole("textbox", { name: "Что дальше" }).fill("Не уходить.");
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  const guard = page.getByRole("dialog", { name: "Сохранить изменения?" });
  await guard.getByRole("button", { name: "Остаться" }).click();
  await expect(guard).toHaveCount(0);
  await expect(page).toHaveURL(/\/works\/demo-ready/);
  await expect(page.locator(".dp-review-window")).toHaveCSS("opacity", "1");
  await expect(page.getByRole("textbox", { name: "Что дальше" })).toHaveValue("Не уходить.");
});

test("homework started from a student page preselects that student", async ({ page }) => {
  await page.goto("/students/polina");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Создать ДЗ", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/homework\?student=polina$/);
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByRole("button", { name: "Назначение", exact: true }).click();
  await expect(page.getByRole("checkbox", { name: /Полина Волкова/ })).toBeChecked();
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Проверка", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Проверка", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/works/new?student=unknown");
  await expect(page).toHaveURL(/\/homework\?student=unknown$/);
});

test("the condition editor groups topics, finds them by name and keeps the task type", async ({
  page,
}) => {
  await page.goto("/works");
  await page.getByRole("link", { name: /Уравнения и преобразования/ }).click();
  await page.getByRole("tab", { name: "Задача 1", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Задача 1", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: /^Изменить условие: / }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("searchbox", { name: "Найти тему" }).fill("логарифмические н");
  const topic = dialog.getByRole("combobox", { name: "Тема задачи" });
  await expect(topic.locator("option", { hasText: "Логарифмические неравенства" })).toHaveCount(1);
  await expect(topic.locator("option", { hasText: "Дроби" })).toHaveCount(0);
  await dialog
    .getByRole("combobox", { name: "Тип задачи" })
    .selectOption({ label: "Квадратное уравнение" });
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Изменить условие: / }).click();
  await expect(page.getByRole("dialog").getByRole("combobox", { name: "Тип задачи" })).toHaveValue(
    "quadratic_eq",
  );
});

test("a condition can be a frame on a page of the original", async ({ page }) => {
  await page.goto("/works");
  await page.getByRole("link", { name: /Уравнения и преобразования/ }).click();
  await page.getByRole("tab", { name: "Задача 1", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Задача 1", exact: true })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page.getByRole("button", { name: /^Изменить условие: / }).click();
  const dialog = page.getByRole("dialog");
  const pageSelect = dialog.getByRole("combobox", { name: "Страница с условием" });
  const firstPage = await pageSelect.locator("option").nth(1).getAttribute("value");
  await pageSelect.selectOption(firstPage!);
  await dialog.getByRole("spinbutton", { name: "Высота" }).fill("30");
  await dialog.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Показать условие на странице" }).click();
  await expect(page.getByText("Условие здесь")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: /^Изменить условие: / }).click();
  await expect(page.getByRole("dialog").getByRole("spinbutton", { name: "Высота" })).toHaveValue(
    "30",
  );
});
