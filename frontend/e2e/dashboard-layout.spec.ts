import { test, expect, type Page } from "@playwright/test";

const order = (page: Page) =>
  page
    .locator("[data-widget]")
    .evaluateAll((elements) => elements.map((element) => (element as HTMLElement).dataset.widget));
const isPhone = (page: Page) => (page.viewportSize()?.width ?? 0) <= 700;

async function seedLayout(page: Page, items: Array<{ id: string; span: number }>) {
  await page.goto("/dashboard");
  await expect(page.locator("[data-widget]").first()).toBeVisible();
  await page.evaluate(
    async (layout) => {
      const request = indexedDB.open("upgrade-demo");
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      const tx = db.transaction("preferences", "readwrite");
      tx.objectStore("preferences").put(layout, "dashboard-layout");
      await new Promise<void>((resolve, reject) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
      db.close();
    },
    { version: 1, items },
  );
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible();
}

test("the untouched overview keeps its order, with the queue first on phones", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("[data-widget]").first()).toBeVisible();
  expect(await order(page)).toEqual(
    isPhone(page)
      ? ["queue", "kpis", "activity", "status", "focus", "roster"]
      : ["kpis", "queue", "focus", "activity", "status", "roster"],
  );
});

test("customizing the overview survives a reload", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toBeFocused();
  await expect(page.locator('[data-widget="kpis"] .dp-widget-body')).toHaveAttribute("inert", "");
  await page.getByRole("button", { name: "Убрать «Фокус на ученике»" }).click();
  await page.getByRole("button", { name: "Добавить виджет" }).click();
  const catalog = page.getByRole("dialog", { name: "Добавить виджет" });
  await expect(catalog.getByRole("button", { name: "Добавить «Фокус на ученике»" })).toBeVisible();
  await catalog.getByRole("button", { name: "Добавить «Гипотезы на проверку»" }).click();
  await expect(catalog).toBeHidden();
  expect((await order(page)).at(-1)).toBe("hypotheses");
  const up = page.getByRole("button", { name: "Поднять «Гипотезы на проверку»" });
  await up.click();
  await expect(up).toBeFocused();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "Настроить" })).toBeFocused();
  const saved = ["kpis", "queue", "activity", "status", "hypotheses", "roster"];
  expect(await order(page)).toEqual(saved);
  await page.reload();
  await expect(page.locator("[data-widget]").first()).toBeVisible();
  expect(await order(page)).toEqual(saved);
  await expect(page.getByRole("heading", { name: "Фокус на ученике" })).toHaveCount(0);
  await page.getByRole("link", { name: /^Область допустимых значений Анна Соколова/ }).click();
  await expect(page).toHaveURL(/\/works\/demo-ready\?task=t2$/);
});

test("cancel drops changes and the original view can be restored", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.locator("[data-widget]").first()).toBeVisible();
  const initial = await order(page);
  await page.getByRole("button", { name: "Настроить" }).click();
  await page.getByRole("button", { name: "Убрать «Сводка»" }).click();
  await page.getByRole("button", { name: "Отмена" }).click();
  expect(await order(page)).toEqual(initial);

  await page.getByRole("button", { name: "Настроить" }).click();
  await page.getByRole("button", { name: "Убрать «Очередь работ»" }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toHaveCount(0);
  expect(await order(page)).not.toContain("queue");
  await page.getByRole("button", { name: "Настроить" }).click();
  await page.getByRole("button", { name: "Исходный вид", exact: true }).click();
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toHaveCount(0);
  expect(await order(page)).toEqual(initial);
});

test("widgets move by pointer and keyboard and resize by their edge", async ({ page }) => {
  test.skip(isPhone(page), "Phones reorder with the arrow buttons.");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  const handle = page.getByRole("button", { name: "Переместить «Ритм работы»" });
  const from = (await handle.boundingBox())!;
  const to = (await page.locator('[data-widget="kpis"]').boundingBox())!;
  await page.mouse.move(from.x + 8, from.y + 8);
  await page.mouse.down();
  await page.mouse.move(from.x + 24, from.y + 24, { steps: 4 });
  await page.mouse.move(to.x + 40, to.y + 30, { steps: 20 });
  await page.mouse.up();
  expect((await order(page))[0]).toBe("activity");

  const kpis = page.getByRole("button", { name: "Переместить «Сводка»" });
  await kpis.focus();
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  expect((await order(page)).slice(0, 3)).toEqual(["activity", "queue", "kpis"]);
  await expect(kpis).toBeFocused();

  const queue = page.locator('[data-widget="queue"]');
  await expect(queue).toHaveAttribute("data-span", "8");
  const grip = (await queue.locator('.dp-widget-resize[data-axis="x"]').boundingBox())!;
  const box = (await queue.boundingBox())!;
  await page.mouse.move(grip.x + 8, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.75, grip.y + grip.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(queue).toHaveAttribute("data-span", "6");
  await page.getByRole("combobox", { name: "Ширина «Очередь работ»" }).selectOption("12");
  await expect(queue).toHaveAttribute("data-span", "12");
});

test("phones reorder with large arrow buttons", async ({ page }) => {
  test.skip(!isPhone(page), "Checked on the phone project.");
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  expect((await order(page))[0]).toBe("kpis");
  await expect(page.getByRole("button", { name: "Переместить «Сводка»" })).toBeHidden();
  await expect(page.getByRole("combobox", { name: "Ширина «Сводка»" })).toHaveCount(0);
  const down = page.getByRole("button", { name: "Опустить «Сводка»" });
  const box = (await down.boundingBox())!;
  expect(Math.min(box.width, box.height)).toBeGreaterThanOrEqual(44);
  await down.click();
  expect((await order(page)).slice(0, 2)).toEqual(["queue", "kpis"]);
});

test("a chart opens the works page when the overview has no queue", async ({ page }) => {
  await seedLayout(page, [
    { id: "kpis", span: 12 },
    { id: "status", span: 6 },
  ]);
  await page
    .getByRole("group", { name: "Фильтр по состоянию" })
    .getByRole("button", { name: /^К проверке/ })
    .click();
  await expect(page).toHaveURL(/\/works\?status=ready&view=all$/);
});

test("leaving with unsaved changes asks first", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  await page.getByRole("button", { name: "Убрать «Сводка»" }).click();
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Ученики", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Сохранить расположение?" });
  await dialog.getByRole("button", { name: "Остаться" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Ученики", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Сохранить и перейти" }).click();
  await expect(page).toHaveURL(/\/students$/);
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Обзор", exact: true })
    .click();
  await expect(page.locator("[data-widget]").first()).toBeVisible();
  expect(await order(page)).not.toContain("kpis");
});

test("a failed save keeps edit mode open", async ({ page }) => {
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  await page.getByRole("button", { name: "Убрать «Сводка»" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.put;
    const patched = function (this: IDBObjectStore, ...args: Parameters<typeof original>) {
      if (this.name === "preferences") throw new DOMException("Full", "QuotaExceededError");
      return original.apply(this, args);
    };
    IDBObjectStore.prototype.put = patched;
    (window as unknown as { restorePut: () => void }).restorePut = () => {
      IDBObjectStore.prototype.put = original;
    };
  });
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("alert")).toContainText("недостаточно места");
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toBeVisible();
  await page.evaluate(() => (window as unknown as { restorePut: () => void }).restorePut());
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toHaveCount(0);
  expect(await order(page)).not.toContain("kpis");
});

test("every widget at its narrowest stays inside the page", async ({ page }) => {
  test.setTimeout(120_000);
  await seedLayout(page, [
    { id: "kpis", span: 6 },
    { id: "queue", span: 6 },
    { id: "focus", span: 3 },
    { id: "inactive", span: 3 },
    { id: "activity", span: 6 },
    { id: "status", span: 4 },
    { id: "reviewSpeed", span: 4 },
    { id: "topicErrors", span: 4 },
    { id: "events", span: 4 },
    { id: "closures", span: 4 },
    { id: "commonGaps", span: 4 },
    { id: "hypotheses", span: 4 },
    { id: "roster", span: 6 },
  ]);
  for (const width of [320, 390, 700, 701, 768, 900, 901, 1024, 1199, 1200, 1201, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    for (const editing of [false, true]) {
      if (editing) await page.getByRole("button", { name: "Настроить" }).click();
      await expect(page.locator("[data-widget]")).toHaveCount(13);
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        `${width}px${editing ? " while editing" : ""}`,
      ).toBe(true);
      if (editing) await page.getByRole("button", { name: "Отмена" }).click();
    }
  }
});

test("widgets of a row end on one line and take a set height", async ({ page }) => {
  test.skip(isPhone(page), "Heights are set on wide screens.");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await page.getByRole("button", { name: "Настроить" }).click();
  const bottom = async (id: string) => {
    const box = (await page.locator(`[data-widget="${id}"]`).boundingBox())!;
    return Math.round(box.y + box.height);
  };
  expect(await bottom("queue")).toBe(await bottom("focus"));
  expect(await bottom("activity")).toBe(await bottom("status"));

  const focus = page.locator('[data-widget="focus"]');
  const before = await bottom("focus");
  const grip = (await focus.locator('.dp-widget-resize[data-axis="y"]').boundingBox())!;
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2 + 160, { steps: 10 });
  await page.mouse.up();
  await expect(focus).toHaveAttribute("data-height", /^\d+$/);
  expect(await bottom("focus")).toBeGreaterThan(before + 100);
  expect(await bottom("queue")).toBe(await bottom("focus"));

  const height = page.getByRole("combobox", { name: "Высота «Фокус на ученике»" });
  await height.selectOption("640");
  await expect(focus).toHaveAttribute("data-height", "640");
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("region", { name: "Настройка обзора" })).toHaveCount(0);
  await page.reload();
  await expect(focus).toHaveAttribute("data-height", "640");
  expect(await bottom("queue")).toBe(await bottom("focus"));

  await page.getByRole("button", { name: "Настроить" }).click();
  await focus.locator('.dp-widget-resize[data-axis="y"]').dblclick();
  await expect(focus).not.toHaveAttribute("data-height", /.*/);
  await expect(height).toHaveValue("");
});
