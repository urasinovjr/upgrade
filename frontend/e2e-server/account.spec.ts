import { submitRegistration } from "./setup";
import { type APIRequestContext, type Page } from "@playwright/test";
import { expect, test } from "./test";
import { endSubscription, resetRateLimits } from "./database";
import { mailedLink, uniqueEmail } from "./mailbox";

const password = "correct horse 42";

async function signUp(page: Page, request: APIRequestContext, email: string) {
  resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Как к вам обращаться").fill("Ольга");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("checkbox", { name: /условия использования/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await submitRegistration(page);
  await page.goto(await mailedLink(request, email));
  await expect(page).toHaveURL(/\/dashboard$/);
}

test("expired subscription switches the workspace to read-only", async ({ page, request }) => {
  const email = uniqueEmail("expired");
  await signUp(page, request, email);
  await page.goto("/subscription");
  await expect(page.getByRole("heading", { name: "Пробный период" })).toBeVisible();

  endSubscription(email);
  await page.reload();

  await expect(page.getByRole("heading", { name: "Подписка закончилась" })).toBeVisible();
  await expect(page.getByRole("status").filter({ hasText: "можно только смотреть" })).toBeVisible();
  await page.goto("/students");
  await expect(page.getByRole("button", { name: "Добавить ученика" }).first()).toBeDisabled();
  await expect(page.getByRole("button", { name: "Открыть ДЗ" })).toBeDisabled();
});

test("teacher deletes the account from settings", async ({ page, request }) => {
  const email = uniqueEmail("delete");
  await signUp(page, request, email);
  await page.getByRole("link", { name: /Настройки и подписка/ }).click();
  await expect(page.getByRole("heading", { name: "Настройки" })).toBeVisible();
  await expect(page.getByText(email)).toBeVisible();

  await page.getByLabel("Пароль", { exact: true }).fill(password);
  const remove = page.getByRole("button", { name: "Удалить аккаунт" });
  await expect(remove).toBeDisabled();
  await page.getByRole("checkbox", { name: /без возможности восстановления/ }).check();
  await remove.click();

  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Не удалось войти. Проверьте логин и пароль");
});
