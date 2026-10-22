import { expect, test } from "@playwright/test";
import { addCheckedWork, addStudent, signUp } from "./setup";

test("another teacher cannot open the first teacher's work, report, student or file", async ({
  page,
  request,
  browser,
}, testInfo) => {
  await signUp(page, request, "owner");
  const studentId = await addStudent(page, "Мария");
  const workId = await addCheckedWork(page, studentId, "Чужая контрольная", [
    { condition: "Решите x + 1 = 2" },
  ]);
  const work = await (await page.request.get("/api/works/" + workId)).json();
  const fileId = work.attachments[0].id;

  const context = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const other = await context.newPage();
  await signUp(other, request, "stranger");

  await other.goto("/works/" + workId);
  await expect(other.getByRole("heading", { name: "Работа не найдена" })).toBeVisible();
  await other.goto("/works/" + workId + "/report");
  await expect(other.getByRole("heading", { name: "Отчёт недоступен" })).toBeVisible();
  await other.goto("/students/" + studentId);
  await expect(other.getByRole("heading", { name: "Ученик не найден" })).toBeVisible();
  expect((await other.request.get("/api/files/" + fileId)).status()).toBe(404);
  expect((await other.request.get("/api/works/" + workId)).status()).toBe(404);
  await other.goto("/works");
  await expect(other.getByRole("heading", { name: "Работы", exact: true })).toBeVisible();
  await expect(other.getByRole("link", { name: /Чужая контрольная/ })).toHaveCount(0);
  await context.close();
});
