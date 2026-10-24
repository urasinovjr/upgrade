import { readFileSync } from "node:fs";
import { expect, type APIRequestContext, type Page } from "@playwright/test";
import { resetRateLimits } from "./database";
import { mailedLink, uniqueEmail } from "./mailbox";

export const password = "correct horse 42";

export interface TaskText {
  condition: string;
  formula?: string;
  reference?: string;
}

export async function register(page: Page, email: string) {
  resetRateLimits();
  await page.goto("/register");
  await page.getByLabel("Как к вам обращаться").fill("Анна Петровна");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("checkbox", { name: /условия использования/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();
}

export async function signUp(page: Page, request: APIRequestContext, prefix: string) {
  const email = uniqueEmail(prefix);
  await register(page, email);
  await page.goto(await mailedLink(request, email));
  await expect(page).toHaveURL(/\/dashboard$/);
  return email;
}

export async function csrfHeaders(page: Page) {
  const session = await (await page.request.get("/api/auth/session")).json();
  return { "X-CSRF-Token": session.csrfToken as string };
}

export async function addStudent(page: Page, name: string) {
  const id = crypto.randomUUID();
  const response = await page.request.put("/api/students/" + id, {
    headers: await csrfHeaders(page),
    data: { name, grade: 10, goal: "", color: "teal" },
  });
  expect(response.ok()).toBe(true);
  return id;
}

function draftTask(task: TaskText, index: number) {
  return {
    id: "t" + (index + 1),
    title: "Задача " + (index + 1),
    condition: task.condition,
    formula: task.formula ?? "",
    reference: task.reference ?? "",
    topicId: "",
    steps: [],
    feedback: "",
    reviewed: false,
    omitted: false,
  };
}

export async function addCheckedWork(
  page: Page,
  studentId: string,
  title: string,
  tasks: TaskText[],
  fileCount = 1,
) {
  const headers = await csrfHeaders(page);
  const id = crypto.randomUUID();
  const files = Array.from({ length: fileCount }, (_, index) => ({
    id: crypto.randomUUID(),
    name: fileCount > 1 ? `page-${index + 1}.png` : "solution.png",
  }));
  const meta = { id, studentId, title, attachments: files, tasks: tasks.map(draftTask) };
  const buffer = readFileSync("e2e/fixtures/solution.png");
  const parts = Object.fromEntries(
    files.map((file) => [file.id, { name: file.name, mimeType: "image/png", buffer }]),
  );
  const created = await page.request.post("/api/works", {
    headers,
    multipart: { meta: JSON.stringify(meta), ...parts },
  });
  expect(created.ok()).toBe(true);
  const work = await created.json();
  const layout = work.attachments.map(
    (item: { id: string; pageOrder: number[]; crops: object; masks: object }) => ({
      id: item.id,
      pageOrder: item.pageOrder,
      crops: item.crops,
      masks: item.masks,
      checkedPages: item.pageOrder,
    }),
  );
  const checked = await page.request.put("/api/works/" + id + "/attachments", {
    headers,
    data: layout,
  });
  expect(checked.ok()).toBe(true);
  return id;
}

export async function startAnalysis(page: Page) {
  await page.getByRole("button", { name: "Запустить разбор" }).first().click();
}

export function taskTab(page: Page, number: number) {
  return page.getByRole("tab", { name: "Задача " + number, exact: true });
}

export async function waitForAnalysis(page: Page) {
  await expect(page.getByRole("button", { name: "Что получил ИИ" })).toBeVisible({
    timeout: 60_000,
  });
}
