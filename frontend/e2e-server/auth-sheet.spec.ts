import { expect, test } from "./test";
import { password, register, signUp } from "./setup";
import { uniqueEmail } from "./mailbox";

test.use({ reducedMotion: "no-preference" });

test("registration ticks the sheet before asking to check the mail", async ({ page }) => {
  await register(page, uniqueEmail("tick"));
  await expect(page.locator('.dp-auth-tick .dp-ink-stroke[data-drawn="true"]')).toHaveCount(1);
});

test("signing in ticks the sheet and then opens the cabinet", async ({ page, request }) => {
  const email = await signUp(page, request, "signin");
  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login/);

  const emailField = page.getByLabel("Почта");
  await emailField.fill(email);
  await page.getByLabel("Пароль").fill(password);
  expect(
    await emailField.evaluate((input) => getComputedStyle(input).backgroundSize),
  ).not.toContain("0%");
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page.locator('.dp-auth-tick .dp-ink-stroke[data-drawn="true"]')).toHaveCount(1);
  await expect(page).toHaveURL(/\/dashboard$/);
});
