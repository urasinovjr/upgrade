import { expect, test } from "@playwright/test";
import { addCheckedWork, addStudent, signUp, startAnalysis, waitForAnalysis } from "./setup";

test(
  "teacher uploads, checks the original, edits and confirms on a phone @mobile",
  { tag: ["@prd-16"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "phone");
    const studentId = await addStudent(page, "Мария");

    await page.goto("/works/new");
    await page.getByLabel("Ученик", { exact: true }).selectOption(studentId);
    await page.getByRole("textbox", { name: "Название работы" }).fill("Работа с телефона");
    await page.getByLabel("Загрузить решение").setInputFiles("e2e/fixtures/solution.png");
    await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
    await page.getByRole("button", { name: "Закрасить данные" }).click();
    await page.getByRole("button", { name: "Отметить: данные скрыты" }).click();
    await expect(page.getByText("Данные скрыты: 1 из 1 стр.")).toBeVisible();
    await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
    await expect(page).toHaveURL(/\/works\/[0-9a-f-]{36}$/);

    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await startAnalysis(page);
    await waitForAnalysis(page);
    await page.getByRole("tab", { name: "Оригинал", exact: true }).click();
    await expect(page.getByAltText("Оригинал: solution.png")).toBeVisible();
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await page.getByRole("textbox", { name: "Что дальше" }).fill("Проверено с телефона");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
    await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
    await expect(page.getByText("Версия 1 подтверждена")).toBeVisible();
  },
);

test(
  "teacher types a step formula on the phone keyboard, reruns the review and confirms @mobile",
  { tag: ["@prd-16"] },
  async ({ page, request }) => {
    test.setTimeout(180_000);
    await signUp(page, request, "phone-formula");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Формула с телефона", [
      { condition: "Решите x - 1 = 2" },
    ]);
    await page.goto("/works/" + workId);
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await startAnalysis(page);
    await waitForAnalysis(page);

    await page.getByRole("button", { name: "Изменить шаг 1" }).click();
    const dialog = page.getByRole("dialog");
    const formula = dialog.locator('math-field[aria-label="Формула шага 1"]');
    await formula.evaluate((element) => {
      (element as HTMLElement & { value: string }).value = "";
    });
    await formula.focus();
    await formula.locator('[part="virtual-keyboard-toggle"]').click();
    const keys = dialog.locator(".MLK__layer.is-visible");
    await expect(keys).toBeVisible();
    for (const key of ["x", "=", "3"]) {
      await keys.locator(`.MLK__keycap[aria-label="${key}"]`).click();
    }
    await expect
      .poll(() => formula.evaluate((element) => (element as HTMLElement & { value: string }).value))
      .toBe("x=3");
    const save = dialog.getByRole("button", { name: "Сохранить шаг" });
    await save.scrollIntoViewIfNeeded();
    await save.click();
    await expect(dialog).toHaveCount(0);

    await startAnalysis(page);
    await page
      .getByRole("dialog", { name: "Запустить разбор заново?" })
      .getByRole("button", { name: "Запустить разбор" })
      .click();
    await expect
      .poll(
        async () => {
          const work = await (await page.request.get("/api/works/" + workId)).json();
          return (
            work.status === "ready" && work.draft.analysedInputRevision === work.draft.inputRevision
          );
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    await page.reload();
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await page.getByRole("button", { name: "Изменить шаг 1" }).click();
    await expect(dialog.locator('math-field[aria-label="Формула шага 1"]')).toHaveJSProperty(
      "value",
      "x=3",
    );
    await dialog.getByRole("combobox", { name: "Вердикт" }).selectOption({ label: "Верно" });
    await dialog.getByRole("textbox", { name: "Объяснение" }).fill("Верно.");
    await save.scrollIntoViewIfNeeded();
    await save.click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
    await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
    await expect(page.getByText("Версия 1 подтверждена")).toBeVisible();

    const confirmed = await (await page.request.get("/api/works/" + workId)).json();
    expect(confirmed.published[0].draft.tasks[0].steps[0].latex).toBe("x=3");
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await expect(page.getByRole("heading", { name: "Формула с телефона" })).toBeVisible();
  },
);
