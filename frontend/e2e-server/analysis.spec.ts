import { type Page } from "@playwright/test";
import { expect, test } from "./test";
import {
  addCheckedWork,
  addStudent,
  signUp,
  startAnalysis,
  selectTask,
  waitForAnalysis,
  waitForReport,
} from "./setup";

const analysisTimeout = { timeout: 60_000 };

async function confirmTask(page: Page, number?: number) {
  if (number) await selectTask(page, number);
  await page.getByRole("button", { name: "Отметить проверенной" }).click();
}

test(
  "unclear and unsupported tasks are marked and the rest is confirmed",
  { tag: ["@prd-04", "@prd-05"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "tasks");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Три задачи", [
      { condition: "Решите x + 1 = 2" },
      { condition: "Решите 4x = 8" },
      { condition: "Найдите производную x^3" },
    ]);

    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await selectTask(page, 3);
    await expect(page.getByText("Задача отложена для отдельной проверки")).toBeVisible();
    await expect(page.getByRole("textbox", { name: "Почему задача отложена" })).toHaveValue(
      "UpGrade пока не разбирает задачи этого типа.",
    );
    await selectTask(page, 2);
    await expect(
      page
        .getByRole("radiogroup", { name: "Вердикт шага 1" })
        .getByRole("radio", { name: "Верно" }),
    ).not.toBeChecked();
    await expect(
      page.getByRole("button", { name: "Опубликовать результат", exact: true }),
    ).toBeDisabled();

    await page
      .getByRole("radiogroup", { name: "Вердикт шага 1" })
      .getByRole("radio", { name: "Верно" })
      .click();
    await confirmTask(page, 2);
    await confirmTask(page, 1);
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 1 опубликована")).toBeVisible();
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await waitForReport(page, 1);
    await expect(page.getByRole("main")).toContainText(
      "Разберём отдельно. UpGrade пока не разбирает задачи этого типа.",
    );
  },
);

test(
  "a failed analysis keeps the work and succeeds on a manual retry",
  { tag: ["@prd-07"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "retry");
    const studentId = await addStudent(page, "Мария");
    const marker = "Решите 2x = 6 [[fail:5]] " + crypto.randomUUID().slice(0, 8);
    const workId = await addCheckedWork(page, studentId, "Сбой провайдера", [
      { condition: marker },
    ]);

    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await expect(page.getByText("Разбор не удался").first()).toBeVisible(analysisTimeout);
    await page.reload();
    await expect(page.getByRole("main")).toContainText(marker);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await expect(page.getByText("Разбор не удался")).toHaveCount(0);
  },
);

test(
  "a new revision replaces the report and withdrawal keeps the history",
  { tag: ["@prd-09", "@prd-10"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "revision");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Две версии", [
      { condition: "Решите x + 1 = 2" },
    ]);

    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await confirmTask(page);
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 1 опубликована")).toBeVisible();

    await page.getByRole("button", { name: "Начать новую версию" }).click();
    await page.getByRole("textbox", { name: "Что дальше" }).fill("Комментарий второй версии");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await confirmTask(page);
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 2 опубликована")).toBeVisible();
    await page.getByRole("link", { name: "Отчёт, версия 2" }).click();
    await waitForReport(page, 2);
    await expect(page.getByRole("main")).toContainText("Комментарий второй версии");

    await page.getByRole("link", { name: "К разбору работы" }).click();
    await page.getByRole("button", { name: "Отозвать публикацию", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Отозвать публикацию" }).click();
    await expect(page.getByRole("link", { name: "Отчёт, версия 2" })).toHaveCount(0);
    await page.getByText("История версий · 2").click();
    await expect(page.getByRole("link", { name: "Версия 1 · архивная" })).toBeVisible();
    await page.getByRole("link", { name: "Версия 2 · архивная" }).click();
    await waitForReport(page, 2);
    await expect(page.getByRole("main")).toContainText("Комментарий второй версии");
  },
);
