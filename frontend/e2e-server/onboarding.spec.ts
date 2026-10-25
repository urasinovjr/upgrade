import { expect, test } from "./test";
import { password, signUp } from "./setup";

test.use({ onboarded: false });

test("the tour choice follows the teacher to another browser", async ({
  page,
  request,
  browser,
  baseURL,
}) => {
  const email = await signUp(page, request, "tour");
  const tour = page.getByRole("dialog");
  await expect(tour.getByRole("heading", { name: "Начните с новой работы" })).toBeVisible();
  await tour.getByRole("button", { name: "Пропустить" }).click();
  await expect(tour).toHaveCount(0);

  const other = await browser.newContext({ baseURL });
  const second = await other.newPage();
  await second.goto("/login");
  await second.getByLabel("Почта").fill(email);
  await second.getByLabel("Пароль").fill(password);
  await second.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(second).toHaveURL(/\/dashboard$/);
  await expect(second.locator(".dp-widget").first()).toBeVisible();
  await second.waitForTimeout(500);
  await expect(second.getByRole("dialog")).toHaveCount(0);

  await second.goto("/settings");
  await second.getByRole("link", { name: "Пройти заново" }).click();
  await expect(second.getByRole("dialog")).toContainText("Шаг 1 из 5");
  await other.close();
});
