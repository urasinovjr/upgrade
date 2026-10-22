import { expect, test } from "@playwright/test";
import { signUp } from "./setup";

test("a guest sees the welcome page at the root and a teacher goes to the dashboard", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator("h1")).toHaveText("ИИ пишет карандашом, вы — ручкой");
  await page.getByRole("main").getByRole("link", { name: "Попробовать 14 дней" }).first().click();
  await expect(page).toHaveURL(/\/register$/);

  await signUp(page, request, "landing");
  await page.goto("/");
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/welcome");
  await expect(page.locator("h1")).toHaveText("ИИ пишет карандашом, вы — ручкой");
});
