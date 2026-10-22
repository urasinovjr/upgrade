import { expect, test } from "@playwright/test";
import { addStudent, signUp, startAnalysis, waitForAnalysis } from "./setup";

test("teacher uploads, checks the original, edits and confirms on a phone @mobile", async ({
  page,
  request,
}) => {
  test.setTimeout(150_000);
  await signUp(page, request, "phone");
  const studentId = await addStudent(page, "Мария");

  await page.goto("/works/new");
  await page.getByLabel("Ученик", { exact: true }).selectOption(studentId);
  await page.getByRole("textbox", { name: "Название работы" }).fill("Работа с телефона");
  await page.getByLabel("Загрузить решение").setInputFiles("e2e/fixtures/solution.png");
  await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
  await page.getByRole("button", { name: "Скрыть данные" }).click();
  await page.getByRole("button", { name: "Отметить страницу проверенной" }).click();
  await expect(page.getByText("Проверено 1 из 1")).toBeVisible();
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await expect(page).toHaveURL(/\/works\/[0-9a-f-]{36}$/);

  await page.getByRole("tab", { name: "Разбор", exact: true }).click();
  await startAnalysis(page);
  await waitForAnalysis(page);
  await page.getByRole("tab", { name: "Оригинал", exact: true }).click();
  await expect(page.getByAltText("Оригинал: solution.png")).toBeVisible();
  await page.getByRole("tab", { name: "Разбор", exact: true }).click();
  await page.getByRole("textbox", { name: "Общий комментарий" }).fill("Проверено с телефона");
  await expect(page.getByText("Сохранено")).toBeVisible();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await expect(page.getByText("Редакция 1 подтверждена")).toBeVisible();
});
