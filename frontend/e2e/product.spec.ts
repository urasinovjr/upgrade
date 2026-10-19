import { test, expect } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import path from "node:path";

test("review → confirmation → report/PDF → versions → gap closure", async ({ page }, testInfo) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/works");
  await expect(page.getByRole("heading", { name: "Работы", exact: true })).toBeVisible();
  await page.getByRole("textbox", { name: "Поиск работ" }).fill("несуществующая");
  await expect(page.getByText("Работы не найдены")).toBeVisible();
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await page.getByRole("link", { name: /Уравнения и преобразования/ }).click();
  await expect(
    page.getByRole("button", { name: "Подтвердить работу", exact: true }),
  ).toBeDisabled();
  const firstTask = page.getByRole("tab", { name: "Задача 1", exact: true });
  const secondTask = page.getByRole("tab", { name: "Задача 2", exact: true });
  await expect(secondTask).toHaveAttribute("aria-selected", "true");
  await firstTask.click();
  await expect(firstTask).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await secondTask.click();
  await page.getByRole("button", { name: "Подтвердить пробел", exact: true }).click();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await expect(page.getByText("Редакция 1 подтверждена")).toBeVisible();
  await page.reload();
  await expect(page.getByText("Редакция 1 подтверждена")).toBeVisible();
  await page.getByRole("link", { name: "Отчёт · v1" }).click();
  await expect(page.getByText("Отчёт по работе", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  const download = await downloadPromise;
  await mkdir("../output/pdf", { recursive: true });
  await download.saveAs(path.resolve("../output/pdf/report-" + testInfo.project.name + ".pdf"));
  await page.getByRole("link", { name: "К разбору работы" }).click();
  await page.getByRole("button", { name: "Новая редакция" }).click();
  await page
    .getByRole("textbox", { name: "Общий комментарий" })
    .fill("Проверка сохранения черновика.");
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Общий комментарий" })).toHaveValue(
    "Проверка сохранения черновика.",
  );
  await firstTask.click();
  await expect(firstTask).toHaveAttribute("aria-selected", "true");
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await secondTask.click();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await expect(page.getByText("Редакция 2 подтверждена")).toBeVisible();
  await page.getByRole("link", { name: "Ученики", exact: true }).click();
  await page
    .getByRole("main")
    .getByRole("link", { name: /Анна Соколова/ })
    .click();
  await expect(
    page.getByRole("list", { name: "Основания", exact: true }).getByRole("listitem"),
  ).toHaveCount(2);
  await page.getByRole("button", { name: "Закрыть пробел", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Основание закрытия" })
    .fill("Три аналогичные задачи решены самостоятельно.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Подтвердить закрытие", exact: true })
    .click();
  await expect(page.locator(".dp-student-gap.is-closed")).toContainText("Пробел закрыт");
  await page.reload();
  await expect(page.locator(".dp-student-gap.is-closed")).toContainText("Пробел закрыт");
  await page.getByRole("button", { name: "Открыть пробел снова" }).click();
  await expect(page.getByText("Подтверждённый пробел", { exact: true })).toBeVisible();
  await page.getByText("История изменений · 2").click();
  await expect(page.getByText("Пробел открыт снова", { exact: true })).toBeVisible();
  await expect(page.getByText("Три аналогичные задачи решены самостоятельно.")).toBeVisible();
  expect(errors).toEqual([]);
});

test("original, formula edit, stale state and simulated job survive reload", async ({
  page,
}, testInfo) => {
  await page.goto("/works/demo-ready");
  const originalTab = page.getByRole("tab", { name: "Оригинал", exact: true });
  if (testInfo.project.name.includes("mobile")) await originalTab.click();
  await expect(page.getByAltText("Оригинал: Учебный пример.svg")).toBeVisible();
  await page.getByRole("button", { name: "Кадрировать" }).click();
  const left = page.getByRole("spinbutton", { name: "Слева", exact: true });
  await left.fill("2");
  await left.press("0");
  await expect(left).toBeFocused();
  await expect(left).toHaveValue("20");
  await page.getByRole("button", { name: "Применить область" }).click();
  if (testInfo.project.name.includes("mobile"))
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
  await expect(page.getByText("Нужна сверка с оригиналом.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Завершить сверку" }).click();
  await expect(page.getByText("Нужна сверка с оригиналом.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  const math = page.getByRole("dialog").locator('math-field[aria-label="Формула шага 1"]');
  await math.evaluate((element) => {
    const field = element as HTMLElement & { value: string };
    field.value = "(x-2)(x-3)=0";
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.getByRole("button", { name: "Применить правку" }).click();
  await expect(page.getByText("Нужна сверка с оригиналом.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Повторить разбор" }).click();
  await page.reload();
  await expect(page.getByText("Обработка… Можно вернуться к работе позже.")).toBeVisible();
  await expect(page.getByText("К проверке", { exact: true })).toBeVisible({ timeout: 10000 });
});

test("user upload remains manual; corrupted files are rejected", async ({ page }) => {
  await page.goto("/works/new");
  await page.getByLabel("Ученик", { exact: true }).selectOption("anna");
  await page.getByRole("textbox", { name: "Название работы" }).fill("Проверка собственного файла");
  await page
    .getByLabel("Загрузить решение")
    .setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") });
  await expect(page.getByRole("alert")).toContainText("повреждено");
  await page.getByLabel("Загрузить решение").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.getByRole("button", { name: "Удалить solution.png" })).toBeVisible();
  await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await expect(page.getByText("Сохранено")).toBeVisible();
  await expect(page.getByRole("button", { name: "Повторить разбор" })).toHaveCount(0);
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  await page
    .getByRole("dialog")
    .locator('math-field[aria-label="Формула шага 1"]')
    .evaluate((element) => {
      const field = element as HTMLElement & { value: string };
      field.value = "x=1";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Применить правку" }).click();
  await page
    .getByRole("radiogroup", { name: "Вердикт шага 1" })
    .getByRole("radio", { name: "Верно" })
    .click();
  await page.getByRole("button", { name: "Завершить сверку" }).click();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await expect(page.getByText("Редакция 1 подтверждена")).toBeVisible();
});

test("all screens remain contained across viewport boundaries", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await mkdir("../output/playwright", { recursive: true });
  for (const width of [320, 390, 700, 701, 768, 900, 901, 1024, 1199, 1200, 1201, 1440, 1920]) {
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
  }
  expect(errors).toEqual([]);
});

test("multi-page PDF, image condition, page order and student creation", async ({
  page,
}, testInfo) => {
  await page.goto("/works/new");
  await page.getByRole("button", { name: "Создать ученика" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Имя ученика" }).fill("Тестовый ученик");
  await dialog.getByRole("combobox", { name: "Класс" }).selectOption("11");
  await dialog.getByRole("button", { name: "Сохранить ученика" }).click();
  await expect(page.getByRole("combobox", { name: "Ученик", exact: true })).toHaveValue(/.+/);
  await page
    .getByRole("textbox", { name: "Название работы" })
    .fill("Работа с PDF и условием на фото");
  await page.getByLabel("Загрузить решение").setInputFiles("e2e/fixtures/solution.pdf");
  await expect(page.getByRole("button", { name: "Удалить solution.pdf" })).toBeVisible();
  await page.getByRole("combobox", { name: "Страница оригинала" }).selectOption("2");
  await page.getByRole("button", { name: "Переместить страницу выше" }).click();
  await expect(
    page.getByRole("combobox", { name: "Страница оригинала" }).locator("option").first(),
  ).toHaveValue("2");
  await page.getByLabel("Прикрепить условие задачи 1").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.getByText("Условие: solution.png")).toBeVisible();
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await page.waitForURL(/\/works\/[^/]+$/);
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Изменить шаг 1" }).click();
  await page
    .getByRole("dialog")
    .locator('math-field[aria-label="Формула шага 1"]')
    .evaluate((element) => {
      const field = element as HTMLElement & { value: string };
      field.value = "x=1";
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  await page.getByRole("button", { name: "Применить правку" }).click();
  await page
    .getByRole("radiogroup", { name: "Вердикт шага 1" })
    .getByRole("radio", { name: "Верно" })
    .click();
  await page.getByRole("button", { name: "Завершить сверку" }).click();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await page.getByRole("link", { name: "Отчёт · v1" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Скачать PDF" }).click();
  await (
    await download
  ).saveAs(path.resolve("../output/pdf/image-condition-" + testInfo.project.name + ".pdf"));
});

test("saving failure keeps edits; keyboard dialog and withdrawal preserve history", async ({
  page,
  context,
  browserName,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/works/demo-confirmed");
  await page.getByRole("button", { name: "Новая редакция" }).click();
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
    .getByRole("textbox", { name: "Общий комментарий" })
    .fill("Изменения должны сохраниться после повтора.");
  await expect(page.getByRole("alert")).toContainText("недостаточно места");
  await page.evaluate(() =>
    (window as Window & { restoreStorage?: () => void }).restoreStorage?.(),
  );
  await page.getByRole("button", { name: "Сохранить", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Общий комментарий" })).toHaveValue(
    "Изменения должны сохраниться после повтора.",
  );
  await page.getByRole("link", { name: "Отчёт · v1" }).click();
  await expect(page.getByText("Изменения должны сохраниться после повтора.")).toHaveCount(0);
  if (browserName === "chromium")
    await context.grantPermissions(["clipboard-read", "clipboard-write"], {
      origin: "http://127.0.0.1:5173",
    });
  await page.getByRole("button", { name: "Скопировать текст" }).click();
  await expect(page.getByRole("button", { name: "Скопировано" })).toBeVisible();
  await page.getByRole("link", { name: "К разбору работы" }).click();
  const trigger = page.getByRole("button", { name: "Отозвать", exact: true });
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
  await dialog.getByRole("button", { name: "Отозвать подтверждение" }).click();
  await expect(page.getByRole("link", { name: "Отчёт · v1" })).toHaveCount(0);
  await page.getByText("История редакций · 1").click();
  await page.getByRole("link", { name: "Редакция 1 · архивная" }).click();
  await expect(
    page.getByText("Это архивная редакция. Она не участвует в актуальной карте ученика."),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

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
    const field = page.getByRole("textbox", { name: "Текст подтверждённого отчёта" });
    await expect(field).toBeVisible();
    await expect(field).toBeFocused();
    await expect(field).toHaveValue(/Самостоятельная · рациональные дроби/);
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
  await page.getByRole("combobox", { name: "Ученик", exact: true }).selectOption("anna");
  await page.getByRole("textbox", { name: "Название работы" }).fill("Только условие");
  await page.getByLabel("Прикрепить условие задачи 1").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.getByText("Условие: solution.png")).toBeVisible();
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await expect(page.getByRole("alert")).toContainText("Добавьте решение ученика отдельно");
  await expect(page).toHaveURL(/\/works\/new$/);
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
  await page.getByRole("textbox", { name: "Общий комментарий" }).fill("Не уходить.");
  await page.getByRole("button", { name: "Закрыть панель" }).click();
  const guard = page.getByRole("dialog", { name: "Сохранить изменения?" });
  await guard.getByRole("button", { name: "Остаться" }).click();
  await expect(guard).toHaveCount(0);
  await expect(page).toHaveURL(/\/works\/demo-ready/);
  await expect(page.locator(".dp-review-window")).toHaveCSS("opacity", "1");
  await expect(page.getByRole("textbox", { name: "Общий комментарий" })).toHaveValue("Не уходить.");
});

test("a new work started from a student page preselects that student", async ({ page }) => {
  await page.goto("/students/polina");
  await page
    .getByRole("main")
    .getByRole("link", { name: "Новая работа", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/works\/new\?student=polina$/);
  await expect(page.getByRole("combobox", { name: "Ученик", exact: true })).toHaveValue("polina");
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Работы", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Работы", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/works/new?student=unknown");
  await expect(page.getByRole("combobox", { name: "Ученик", exact: true })).toHaveValue("");
});
