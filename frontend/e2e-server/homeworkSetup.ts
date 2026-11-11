import { expect, type Page } from "@playwright/test";

export async function prepareSubmission(page: Page, studentId: string, title: string) {
  await page.goto("/homework?student=" + encodeURIComponent(studentId));
  await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
  await page.getByRole("textbox", { name: "Название ДЗ", exact: true }).fill(title);
  await page.getByRole("button", { name: "Сверить задания" }).click();
  await page.getByRole("button", { name: "Добавить задание", exact: true }).click();
  await page.getByRole("textbox", { name: "Условие", exact: true }).fill("Решите x + 1 = 2");
  await page.getByRole("checkbox", { name: "Условие сверено с оригиналом" }).check();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
  await page.getByRole("button", { name: "К назначению" }).click();
  await page.getByRole("button", { name: "Назначить ученикам" }).click();
  await page.getByRole("button", { name: "Загрузить за ученика" }).click();
  await page.getByLabel("Фотографии решения").setInputFiles("e2e/fixtures/solution.png");
  await expect(page.getByRole("button", { name: "Убрать", exact: true })).toHaveCount(1);
  await page.getByRole("button", { name: "Отправить ДЗ целиком" }).click();
  await page.waitForURL(/\/works\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  const original = page.getByRole("tab", { name: "Оригинал", exact: true });
  if (await page.evaluate(() => matchMedia("(max-width: 1199px)").matches)) await original.click();
}
