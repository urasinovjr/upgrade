import { submitRegistration } from "./setup";
import { expect, test } from "./test";
import { resetRateLimits } from "./database";
import { mailedLink, uniqueEmail } from "./mailbox";

test("teacher archives, restores and deletes a student", async ({ page, request }) => {
  const email = uniqueEmail("archive");
  resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Как к вам обращаться").fill("Ирина");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill("correct horse 42");
  await page.getByRole("checkbox", { name: /условия использования/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await submitRegistration(page);
  await page.goto(await mailedLink(request, email));
  await expect(page).toHaveURL(/\/dashboard$/);

  await page.goto("/students");
  await page.getByRole("button", { name: "Добавить ученика" }).first().click();
  await page.getByRole("dialog").getByLabel("Имя ученика").fill("Пётр");
  await page.getByRole("button", { name: "Сохранить ученика" }).click();
  await page.locator(".sidebar").getByRole("link", { name: "Пётр" }).click();

  await page.getByRole("button", { name: "В архив" }).click();
  await expect(page.getByRole("button", { name: "Вернуть из архива" })).toBeVisible();
  await expect(page.locator(".sidebar").getByRole("link", { name: "Пётр" })).toHaveCount(0);
  await page.reload();
  await page.getByRole("button", { name: "Вернуть из архива" }).click();
  await expect(page.locator(".sidebar").getByRole("link", { name: "Пётр" })).toBeVisible();

  await page.getByRole("button", { name: "Удалить" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Удалить ученика" }).click();
  await expect(page).toHaveURL(/\/students$/);
  await expect(page.locator(".sidebar").getByRole("link", { name: "Пётр" })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("main").getByText("Учеников пока нет")).toBeVisible();
});
