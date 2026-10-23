import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("dashboard navigation, filters and confirmed gaps follow current data", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  const home = page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Обзор", exact: true });
  await expect(home).toHaveAttribute("aria-current", "page");
  const waiting = page.getByRole("link", { name: "К проверке: 1", exact: true });
  await waiting.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("combobox", { name: "Статус" })).toHaveValue("ready");
  await expect(page.locator(".work-row")).toHaveCount(1);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Статус" })).toHaveValue("ready");
  await page.getByRole("button", { name: "Сбросить фильтры" }).click();
  await expect(page.locator(".work-row")).toHaveCount(5);
  await home.click();
  await page.getByRole("link", { name: "Подтверждены: 1", exact: true }).click();
  await expect(
    page
      .getByRole("group", { name: "Фильтр работ" })
      .getByRole("button", { name: /^Подтверждены/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".work-row")).toHaveCount(1);
  await page.locator(".work-row").click();
  await page.getByRole("button", { name: "Новая версия", exact: true }).click();
  await home.click();
  await expect(page.getByRole("link", { name: "К проверке: 2", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Подтверждены: 1", exact: true }).click();
  await expect(page.locator(".work-row")).toHaveCount(1);
  await home.click();
  await page.locator(".dashboard-recommendation").click();
  await expect(page).toHaveURL(/topic=domain$/);
  await expect(
    page.getByRole("button", { name: "Область допустимых значений · Повторить" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Закрыть пробел", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Почему пробел закрыт" })
    .fill("Повторная работа без ошибок.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Закрыть пробел", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Область допустимых значений · Пробел закрыт" }),
  ).toHaveAttribute("aria-pressed", "true");
  await home.click();
  await expect(
    page.getByRole("link", { name: "Темы для повторения: 0", exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Открытых пробелов нет.", { exact: false })).toBeVisible();
  await page.goto("/students/anna?topic=unknown");
  await expect(
    page.getByRole("button", { name: "Область допустимых значений · Пробел закрыт" }),
  ).toHaveAttribute("aria-pressed", "true");
  const powers = page.getByRole("button", { name: "Степени · Нет данных" });
  await powers.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/topic=powers$/);
  await expect(powers).toHaveAttribute("aria-pressed", "true");
  await page.goto("/students/anna");
  await page.getByRole("button", { name: "Открыть карту", exact: true }).focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/tab=map&topic=/);
  await expect(
    page.locator(".dp-map-node.selected, .dp-map-level-node.selected").filter({ visible: true }),
  ).toBeFocused();
  await page.goto("/students/anna?topic=domain");
  await page.getByRole("button", { name: "Открыть пробел снова" }).click();
  await home.click();
  await expect(
    page.getByRole("link", { name: "Темы для повторения: 1", exact: true }),
  ).toBeVisible();
  await page.goto("/works/demo-confirmed");
  await page.getByRole("button", { name: "Отозвать", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Отозвать подтверждение" }).click();
  await home.click();
  await expect(page.getByRole("link", { name: "Подтверждены: 0", exact: true })).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Темы для повторения: 0", exact: true }),
  ).toBeVisible();
});

test("an impossible day in the URL is ignored instead of breaking the queue", async ({ page }) => {
  for (const route of [
    "/works?day=2026-02-31",
    "/works?day=2020-13-99",
    "/dashboard?day=2026-99-01",
  ]) {
    await page.goto(route);
    await expect(page.locator("h1")).toBeVisible();
    await expect(page.getByText("Не удалось открыть экран")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Сбросить фильтры" })).toHaveCount(0);
    await expect(page.locator(".work-row").first()).toBeVisible();
  }
});

test("quick upload validates files and hands off a batch exactly once", async ({ page }) => {
  await page.goto("/dashboard");
  const input = page.getByLabel("Быстрая загрузка решения");
  await input.setInputFiles({
    name: "broken.png",
    mimeType: "image/png",
    buffer: Buffer.from("broken"),
  });
  await expect(page.getByRole("alert")).toContainText("повреждено");
  await input.setInputFiles({
    name: "large.png",
    mimeType: "image/png",
    buffer: Buffer.alloc(20 * 1024 * 1024 + 1),
  });
  await expect(page.getByRole("alert")).toContainText("максимальный размер");
  await input.setInputFiles(["e2e/fixtures/solution.png", "e2e/fixtures/solution.pdf"]);
  await expect(page).toHaveURL(/\/works\/new$/);
  await expect(page.getByRole("button", { name: "Удалить solution.png" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: "Удалить solution.pdf" })).toHaveCount(1);
  await page.getByRole("combobox", { name: "Ученик", exact: true }).selectOption("anna");
  await page.getByRole("textbox", { name: "Название работы" }).fill("Загрузка с главной");
  await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await page.waitForURL(/\/works\/[^/]+$/);
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
  const original = page.getByRole("tab", { name: "Оригинал", exact: true });
  if (await original.isVisible()) await original.click();
  await expect(
    page.getByRole("combobox", { name: "Оригинал работы" }).locator("option"),
  ).toHaveCount(2);
});

test("drop upload works; an unsaved form reload asks to choose files again", async ({ page }) => {
  await page.goto("/dashboard");
  const input = page.getByLabel("Быстрая загрузка решения");
  await input.focus();
  await expect(input).toBeFocused();
  const bytes = [...(await readFile("e2e/fixtures/solution.png"))];
  const dataTransfer = await page.evaluateHandle((data) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([new Uint8Array(data)], "dropped.png", { type: "image/png" }));
    return transfer;
  }, bytes);
  await page.locator(".dashboard-upload .dropzone").dispatchEvent("drop", { dataTransfer });
  await expect(page).toHaveURL(/\/works\/new$/);
  await expect(page.getByRole("button", { name: "Удалить dropped.png" })).toHaveCount(1);
  page.once("dialog", (dialog) => void dialog.accept());
  await page.reload();
  await expect(
    page.getByText("Страница перезагрузилась, и файлы не сохранились.", { exact: false }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Удалить dropped.png" })).toHaveCount(0);
});

test("leaving during decoding does not redirect back to the upload form", async ({ page }) => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let entered!: () => void;
  const loading = new Promise<void>((resolve) => {
    entered = resolve;
  });
  await page.route("**/src/shared/PdfPage.tsx", async (route) => {
    entered();
    await gate;
    await route.continue();
  });
  await page.goto("/dashboard");
  await page.getByLabel("Быстрая загрузка решения").setInputFiles("e2e/fixtures/solution.pdf");
  await loading;
  await expect(page.getByText("Проверяем файлы…", { exact: true })).toBeVisible();
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Ученики", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Ученики", exact: true })).toBeVisible();
  const library = page.waitForResponse("**/src/shared/PdfPage.tsx");
  release();
  await library;
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/students$/);
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Работы", exact: true })
    .click();
  await page.getByRole("link", { name: "Новая работа", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Новая работа", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Удалить solution.pdf" })).toHaveCount(0);
});

test("empty dashboard and reading error provide a useful next action", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Обзор", level: 1 })).toBeVisible();
  await page.evaluate(async () => {
    const request = indexedDB.open("upgrade-demo");
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put({ works: [], students: [], closures: [] }, "root");
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
  await page.reload();
  await expect(page.getByRole("link", { name: "Ученики: 0", exact: true })).toBeVisible();
  await expect(page.getByText("Добавьте первую работу", { exact: true })).toBeVisible();
  await expect(page.getByText("Открытых пробелов нет.", { exact: false })).toBeVisible();
  await page.getByRole("main").getByRole("link", { name: "Добавить ученика", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Новый ученик" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Ученики", level: 1 })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/dashboard");
  await page.addInitScript(() => {
    const original = IDBObjectStore.prototype.get;
    (window as Window & { restoreReading?: () => void }).restoreReading = () => {
      IDBObjectStore.prototype.get = original;
    };
    IDBObjectStore.prototype.get = function (...args: Parameters<typeof original>) {
      if (this.name === "state") throw new Error("Тестовая ошибка чтения.");
      return original.apply(this, args);
    };
  });
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("Тестовая ошибка чтения.");
  await page.evaluate(() =>
    (window as Window & { restoreReading?: () => void }).restoreReading?.(),
  );
  await page.getByRole("button", { name: "Попробовать ещё раз", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Обзор", level: 1 })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ученики: 0", exact: true })).toBeVisible();
});
