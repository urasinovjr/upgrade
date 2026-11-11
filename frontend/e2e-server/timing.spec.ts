import { submitRegistration } from "./setup";
import { expect, test } from "./test";
import { countFor, enrollInPilot, resetRateLimits } from "./database";
import { mailedLink, uniqueEmail } from "./mailbox";
import { prepareSubmission } from "./homeworkSetup";

test("pilot teacher's active time and manual check reach the server", async ({ page, request }) => {
  test.setTimeout(90_000);
  const email = uniqueEmail("timing");
  resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Как к вам обращаться").fill("Ольга");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill("correct horse 42");
  await page.getByRole("checkbox", { name: /условия использования/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await submitRegistration(page);
  await page.goto(await mailedLink(request, email));
  await expect(page).toHaveURL(/\/dashboard$/);
  enrollInPilot(email);

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Замер времени для пилота" })).toBeVisible();
  await page.goto("/students");
  await page.getByRole("button", { name: "Добавить ученика" }).first().click();
  await page.getByRole("dialog").getByLabel("Имя ученика").fill("Пётр");
  await page.getByRole("button", { name: "Сохранить ученика" }).click();
  await expect(page.getByRole("main").getByText("Пётр").first()).toBeVisible();

  const state = await (await page.request.get("/api/state")).json();
  const studentId = state.students.find((student: { name: string }) => student.name === "Пётр").id;
  await prepareSubmission(page, studentId, "Замер");
  await page.keyboard.press("Tab");
  await page.waitForTimeout(1200);
  await page.keyboard.press("Tab");

  await page.goto("/timing");
  await page.getByRole("button", { name: "Начать проверку" }).click();
  await expect(page.getByRole("timer")).toBeVisible();
  await page.getByRole("button", { name: "Пауза" }).click();
  await page.getByRole("button", { name: "Закончить проверку" }).click();
  await page.getByLabel("Время проверки, минут").fill("12");
  await page.getByRole("button", { name: "Сохранить замер" }).click();
  await expect(page.getByText(/задач: 3 · Уравнения · 12 мин/)).toBeVisible();

  await page.close({ runBeforeUnload: true });
  await expect
    .poll(() => countFor("active_intervals", email), { timeout: 15_000 })
    .toBeGreaterThan(0);
  expect(countFor("manual_sessions", email)).toBe(1);
});
