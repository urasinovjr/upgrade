import { expect, test, type Page } from "@playwright/test";
import {
  addCheckedWork,
  addStudent,
  csrfHeaders,
  signUp,
  startAnalysis,
  taskTab,
  waitForAnalysis,
} from "./setup";

const analysisTimeout = { timeout: 60_000 };

async function confirmTasks(page: Page, count: number) {
  for (let number = 1; number <= count; number += 1) {
    if (count > 1) await taskTab(page, number).click();
    await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  }
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
}

async function readWork(page: Page, workId: string) {
  const response = await page.request.get("/api/works/" + workId);
  expect(response.ok()).toBe(true);
  return response.json();
}

test(
  "tasks on several pages keep their own steps and the page order",
  { tag: ["@prd-01"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "pages");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(
      page,
      studentId,
      "Две страницы",
      [
        { condition: "Решите x + 1 = 2", reference: "x+1=2\nx=1" },
        { condition: "Решите 4x = 8", reference: "4x=8\nx=2" },
      ],
      2,
    );

    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    const work = await readWork(page, workId);
    const steps = work.draft.tasks.map((task: { steps: { latex: string }[] }) =>
      task.steps.map((step) => step.latex),
    );

    expect(work.attachments.map((file: { name: string }) => file.name)).toEqual([
      "page-1.png",
      "page-2.png",
    ]);
    expect(steps).toEqual([
      ["x+1=2", "x=1"],
      ["4x=8", "x=2"],
    ]);
    await taskTab(page, 2).click();
    await expect(page.getByRole("heading", { name: "Решите 4x = 8" })).toBeVisible();
    await page.getByRole("button", { name: "Что получил ИИ" }).click();
    await expect(page.getByRole("figure", { name: /^Страница 1 · page-/ })).toHaveText([
      /page-1\.png/,
      /page-2\.png/,
    ]);
  },
);

test(
  "a task without a condition asks for one and cannot be confirmed",
  { tag: ["@prd-04"] },
  async ({ page, request }) => {
    await signUp(page, request, "nocondition");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Без условия", [{ condition: "" }]);

    await page.goto("/works/" + workId);

    await expect(page.getByText("Задача 1: добавьте условие").first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Подтвердить работу", exact: true }),
    ).toBeDisabled();
  },
);

test(
  "a failed analysis of a new version keeps the edits and the published version",
  { tag: ["@prd-07"] },
  async ({ page, request }) => {
    test.setTimeout(180_000);
    await signUp(page, request, "failkeeps");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Сбой после подтверждения", [
      { condition: "Решите x + 1 = 2" },
    ]);
    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await confirmTasks(page, 1);
    await expect(page.getByText("Версия 1 подтверждена")).toBeVisible();

    await page.getByRole("button", { name: "Начать новую версию" }).click();
    await page.getByRole("textbox", { name: "Что дальше" }).fill("Правка до сбоя");
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    const marker = "Решите x + 1 = 2 [[fail:5]] " + crypto.randomUUID().slice(0, 8);
    await page.getByRole("button", { name: "Добавить задачу" }).click();
    await page.getByRole("dialog").getByRole("textbox", { name: "Условие" }).fill(marker);
    await page.getByRole("dialog").getByRole("button", { name: "Сохранить" }).click();
    await expect(page.getByText("Сохранено", { exact: true })).toBeVisible();
    await startAnalysis(page);
    await page
      .getByRole("dialog", { name: "Запустить разбор заново?" })
      .getByRole("button", { name: "Запустить разбор" })
      .click();
    await expect(page.getByText("Разбор не удался").first()).toBeVisible(analysisTimeout);
    await page.reload();

    await expect(page.getByRole("textbox", { name: "Что дальше" })).toHaveValue("Правка до сбоя");
    await expect(page.getByRole("main")).toContainText(marker);
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await expect(page.getByRole("main")).toContainText("Решите x + 1 = 2");
    await expect(page.getByRole("main")).not.toContainText("[[fail");
  },
);

test(
  "repeated confirmation counts the work once on the overview",
  { tag: ["@prd-08"] },
  async ({ page, request }) => {
    test.setTimeout(150_000);
    await signUp(page, request, "twice");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Одно подтверждение", [
      { condition: "Решите x + 1 = 2" },
    ]);
    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await confirmTasks(page, 1);
    await expect(page.getByText("Версия 1 подтверждена")).toBeVisible();

    const headers = await csrfHeaders(page);
    const again = await Promise.all(
      [1, 2].map(() => page.request.post("/api/works/" + workId + "/actions/confirm", { headers })),
    );
    expect(again.every((response) => response.status() < 500)).toBe(true);
    const work = await readWork(page, workId);
    expect(work.published).toHaveLength(1);
    await page.goto("/dashboard");
    await expect(page.getByRole("link", { name: "Подтверждены: 1", exact: true })).toBeVisible();
  },
);

test(
  "a gap counts only after the tutor accepts it and closes only with a reason",
  { tag: ["@prd-11", "@prd-12"] },
  async ({ page, request }) => {
    test.setTimeout(180_000);
    await signUp(page, request, "gaps");
    const studentId = await addStudent(page, "Мария");
    const workId = await addCheckedWork(page, studentId, "Ошибка в решении", [
      { condition: "Решите 3x = 9" },
    ]);
    await page.goto("/works/" + workId);
    await startAnalysis(page);
    await waitForAnalysis(page);
    await expect(
      page.getByRole("button", { name: "Подтвердить пробел", exact: true }),
    ).toBeVisible();
    await confirmTasks(page, 1);
    await expect(page.getByText("Версия 1 подтверждена")).toBeVisible();
    await page.goto("/students/" + studentId);
    await expect(page.getByRole("main")).toContainText("0 открытых пробелов");

    await page.goto("/works/" + workId);
    await page.getByRole("button", { name: "Начать новую версию" }).click();
    await page.getByRole("button", { name: "Подтвердить пробел", exact: true }).click();
    await confirmTasks(page, 1);
    await expect(page.getByText("Версия 2 подтверждена")).toBeVisible();
    await page.goto("/students/" + studentId);
    await expect(page.getByRole("main")).toContainText("1 открытый пробел");

    await page.getByRole("button", { name: "Закрыть пробел", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await expect(
      dialog.getByRole("button", { name: "Закрыть пробел", exact: true }),
    ).toBeDisabled();
    await dialog
      .getByRole("textbox", { name: "Почему пробел закрыт" })
      .fill("Решила три похожие задачи без ошибок.");
    await dialog.getByRole("button", { name: "Закрыть пробел", exact: true }).click();
    await expect(page.getByRole("main")).toContainText("1 закрытый пробел");
    await expect(page.getByRole("main")).toContainText("0 открытых пробелов");
  },
);
