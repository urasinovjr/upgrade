import AxeBuilder from "@axe-core/playwright";
import { expect, test, readDemoWork, writeDemo } from "./onboarding";

test("homework saves the source before leaving through its navigation guard", async ({ page }) => {
  await page.goto("/homework");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Текст для распознавания" })
    .fill("Докажите равенство углов ABC и BCA.");
  const editorUrl = page.url();
  await page
    .getByRole("navigation", { name: "Основная навигация" })
    .getByRole("link", { name: "Проверка", exact: true })
    .click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Сохранить и выйти", exact: true })
    .click();
  await expect(page).toHaveURL(/\/works$/);
  await page.goto(editorUrl);
  await expect(page.getByRole("textbox", { name: "Текст для распознавания" })).toHaveValue(
    "Докажите равенство углов ABC и BCA.",
  );
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
});

test("homework creation, assignment, submission recovery and published student history", async ({
  page,
}) => {
  test.setTimeout(90_000);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/homework");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Новое ДЗ", exact: true })).toBeVisible();
  await page
    .getByRole("textbox", { name: "Текст для распознавания" })
    .fill("Вычислите 1/2 + 1/3.\n\nРешите уравнение x² = 4.");
  await page.getByRole("button", { name: "Распознать условия", exact: true }).click();
  await page.getByRole("button", { name: "Добавить распознанные задания" }).click();
  const confirmations = page.getByRole("checkbox", { name: "Условие сверено с оригиналом" });
  await expect(confirmations).toHaveCount(2);
  await confirmations.nth(0).check();
  await confirmations.nth(1).check();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
  await page.reload();
  await expect(confirmations.nth(0)).toBeChecked();
  await page.getByRole("button", { name: "К назначению" }).click();
  await page.getByRole("checkbox", { name: /Анна Соколова/ }).check();
  await page.getByRole("button", { name: "Назначить ученикам" }).click();
  await expect(page.getByRole("heading", { name: "Назначения", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Создать копию" })).toBeVisible();
  const stored = await page.evaluate(async () => {
    const opening = indexedDB.open("upgrade-demo");
    const db = await new Promise<IDBDatabase>((resolve) => {
      opening.onsuccess = () => resolve(opening.result);
    });
    const request = db.transaction("preferences").objectStore("preferences").get("homework");
    const items = await new Promise<import("../src/domain/homework").Homework[]>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return items[0];
  });
  await page.goto("/student?demo=" + stored.assignments[0].studentId);
  await page.getByRole("button", { name: "Открыть задания" }).click();
  await page
    .getByLabel("Фотографии решения")
    .first()
    .setInputFiles(["e2e/fixtures/solution.png", "e2e/fixtures/solution.png"]);
  await expect(page.getByRole("button", { name: "Убрать", exact: true })).toHaveCount(2);
  await page.reload();
  await page.getByRole("button", { name: "Открыть задания" }).click();
  await expect(page.getByRole("button", { name: "Убрать", exact: true })).toHaveCount(2);
  await page.getByRole("button", { name: "Отправить ДЗ целиком" }).click();
  await expect(page.getByText("ДЗ отправлено. Результат появится после проверки")).toBeVisible();
  await expect(page.getByRole("button", { name: "Ожидает проверки" })).toBeDisabled();
  const state = await page.evaluate(async () => {
    const opening = indexedDB.open("upgrade-demo");
    const db = await new Promise<IDBDatabase>((resolve) => {
      opening.onsuccess = () => resolve(opening.result);
    });
    const request = db.transaction("state").objectStore("state").get("root");
    const state = await new Promise<import("../src/domain/models").StoreState>((resolve) => {
      request.onsuccess = () => resolve(request.result);
    });
    db.close();
    return state;
  });
  const work = state.works.find((work) => work.assignmentId === stored.assignments[0].id)!;
  expect(work.taskFiles?.[stored.tasks[0].id]).toHaveLength(2);
  expect(work.draft.tasks[1].omitted).toBe(true);
  await page.goto("/works/" + work.id);
  await expect(page.getByRole("button", { name: /Изменить условие/ })).toHaveCount(0);
  const reviewed = structuredClone(work);
  reviewed.status = "ready";
  reviewed.draft.analysedInputRevision = reviewed.draft.inputRevision;
  reviewed.draft.tasks[0] = {
    ...reviewed.draft.tasks[0],
    steps: [{ id: "s1", latex: "1/2+1/3=5/6", verdict: "correct", explanation: "" }],
    reviewed: true,
    feedback: "Решение верное.",
  };
  await writeDemo(page, "state", "root", {
    ...state,
    works: state.works.map((work) => (work.id === reviewed.id ? reviewed : work)),
  });
  await page.reload();
  await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
  await expect(page.getByText("Версия 1 опубликована")).toBeVisible();
  expect((await readDemoWork(page, work.id))?.currentPublishedId).toBeTruthy();
  await page.goto("/student?demo=" + stored.assignments[0].studentId);
  await expect(page.getByRole("button", { name: "Сдать ещё раз" })).toBeVisible();
  await expect(page.getByText("Задание 1 · Решено", { exact: true })).toBeVisible();
  await expect(page.getByText("Задание 2 · Нужно уточнить", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Скачать результаты" })).toBeEnabled();
  expect(errors).toEqual([]);
});

test("homework editor reflows and supports keyboard and accessibility", async ({ page }, info) => {
  await page.goto("/homework");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByRole("button", { name: "Сверить задания" }).click();
  await page.getByRole("button", { name: "Добавить задание", exact: true }).click();
  await page
    .getByRole("textbox", { name: "Условие", exact: true })
    .fill("Докажите равенство углов при основании равнобедренного треугольника.");
  await page.getByRole("checkbox", { name: "Условие сверено с оригиналом" }).check();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
  const result = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
    .analyze();
  expect(
    result.violations.filter((violation) =>
      ["serious", "critical"].includes(violation.impact ?? ""),
    ),
  ).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Условия", exact: true }).click();
  await page.getByRole("textbox", { name: "Название ДЗ", exact: true }).focus();
  await page.keyboard.press("Tab");
  if (info.project.name === "chromium")
    await expect(page.getByLabel("Добавить фотографии или PDF")).toBeFocused();
  else await expect(page.locator(":focus")).toHaveCount(1);
  await page.screenshot({
    path: "../output/playwright/homework-" + info.project.name + ".png",
    fullPage: true,
  });
});

test("exam version, deadline, copy, invitation and editable materials", async ({ page }) => {
  await page.goto("/homework");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByRole("button", { name: "Сверить задания" }).click();
  await page.getByRole("button", { name: "Добавить задание", exact: true }).click();
  await page.getByRole("textbox", { name: "Условие", exact: true }).fill("Докажите утверждение.");
  await page
    .getByRole("combobox", { name: "Источник", exact: true })
    .selectOption({ label: "ЕГЭ, профильный, 2027 · проект" });
  await page.getByRole("combobox", { name: "Позиция в экзамене", exact: true }).selectOption("20");
  await page.getByRole("checkbox", { name: "Условие сверено с оригиналом" }).check();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
  await page.getByRole("button", { name: "К назначению" }).click();
  await page.getByRole("checkbox", { name: /Анна Соколова/ }).check();
  await page.getByLabel("Общий срок сдачи · необязательно").fill("2027-06-01T18:00");
  await page.getByRole("button", { name: "Назначить ученикам" }).click();
  await expect(page.getByRole("heading", { name: "Назначения", exact: true })).toBeVisible();
  await page.getByLabel("Общий срок сдачи · необязательно").fill("");
  await page.getByRole("button", { name: "Изменить срок", exact: true }).click();
  await expect(page.getByLabel("Общий срок сдачи · необязательно")).toHaveValue("");
  await page.getByRole("button", { name: "Создать копию", exact: true }).click();
  await expect(page.getByRole("button", { name: "Сохранить черновик", exact: true })).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Позиция в экзамене", exact: true })).toHaveValue(
    "20",
  );
  await page.goto("/students/anna");
  await page.getByRole("button", { name: "Доступ ученика", exact: true }).click();
  await page.getByRole("button", { name: "Создать приглашение", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ссылка активации", exact: true })).toHaveValue(
    /student\?demo=anna/,
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.goto("/works/demo-confirmed");
  await page.getByText("Отработка", { exact: true }).first().click();
  await page.getByRole("button", { name: /^Подготовить отработку:/ }).click();
  await page.getByText("Открыть отработку", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Ответ", exact: true })).toHaveCount(3);
  await page
    .getByRole("textbox", { name: "Краткое объяснение", exact: true })
    .fill("Проверено и исправлено репетитором.");
  await page.getByRole("button", { name: "Сохранить отработку", exact: true }).click();
  await expect(page.getByText("Отработка сохранена")).toBeVisible();
  await page.reload();
  await page.getByText("Отработка", { exact: true }).first().click();
  await page.getByText("Открыть отработку", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Краткое объяснение", exact: true })).toHaveValue(
    "Проверено и исправлено репетитором.",
  );
  await page.getByRole("button", { name: "Создать ДЗ из условий", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Условие", exact: true })).toHaveCount(3);
  await expect(
    page.getByRole("checkbox", { name: "Условие сверено с оригиналом" }).first(),
  ).not.toBeChecked();
  await expect(page.getByRole("textbox", { name: "Ответ", exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Название ДЗ", exact: true })).toHaveValue(
    "Отработка · три упражнения",
  );
});

test("sequential original uploads keep successful files and selection after redaction", async ({
  page,
}) => {
  await page.goto("/homework");
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  const { readFileSync } = await import("node:fs");
  const buffer = readFileSync("e2e/fixtures/solution.png");
  await page.getByLabel("Добавить фотографии или PDF").setInputFiles([
    { name: "z.png", mimeType: "image/png", buffer },
    { name: "broken.png", mimeType: "image/png", buffer: Buffer.from("broken") },
    { name: "a.png", mimeType: "image/png", buffer },
  ]);
  await expect(page.getByRole("alert")).toContainText("broken.png");
  await expect(page.getByText("Обработано: 3 из 3")).toBeVisible();
  const original = page.getByRole("combobox", { name: "Оригинал работы", exact: true });
  await expect(original.locator("option")).toHaveText(["1. a.png", "2. z.png"]);
  await original.selectOption({ label: "2. z.png" });
  const selected = await original.inputValue();
  await page
    .getByRole("button", { name: "Обрезать", exact: true })
    .count()
    .then((count) => expect(count).toBe(0));
  await expect(page.getByRole("button", { name: "Файл выше", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Отметить: данные скрыты" }).click();
  await expect(original).toHaveValue(selected);
});
