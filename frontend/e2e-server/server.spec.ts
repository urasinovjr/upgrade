import { expect, test } from "./test";
import { mailedLink, uniqueEmail } from "./mailbox";
import { password, register, waitForAnalysis, waitForReport } from "./setup";
import { prepareSubmission } from "./homeworkSetup";

test(
  "teacher registers, uploads a work, runs analysis and confirms it",
  { tag: ["@prd-15"] },
  async ({ page, request }) => {
    test.setTimeout(120_000);
    const email = uniqueEmail("teacher");
    await page.goto("/dashboard");
    await expect(page).toHaveURL(/\/login\?next=%2Fdashboard/);

    await register(page, email);
    await page.goto(await mailedLink(request, email));
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.locator(".dp-sidebar-person")).toContainText("Анна Петровна");

    await page.goto("/students");
    await page.getByRole("button", { name: "Добавить ученика" }).first().click();
    await page.getByRole("dialog").getByLabel("Имя ученика").fill("Мария");
    await page.getByRole("button", { name: "Сохранить ученика" }).click();
    await expect(page.getByRole("main").getByText("Мария").first()).toBeVisible();

    const state = await (await page.request.get("/api/state")).json();
    const studentId = state.students.find(
      (student: { name: string }) => student.name === "Мария",
    ).id;
    await prepareSubmission(page, studentId, "Контрольная по уравнениям");
    await page.getByRole("button", { name: "Закрасить данные" }).click();
    await page.getByRole("button", { name: "Закрасить область" }).click();
    await page.getByRole("button", { name: "Отметить: данные скрыты" }).click();
    await expect(page.getByText("Данные скрыты: 1 из 1 стр.")).toBeVisible();
    await expect(page.getByText("Данные скрыты", { exact: true })).toBeVisible();
    await expect(page.locator(".mask-box")).toHaveCount(1);

    await page.getByRole("button", { name: "Запустить разбор" }).first().click();
    await waitForAnalysis(page);
    await page.getByRole("button", { name: "Первый разбор ИИ" }).click();
    await expect(page.getByText(/^Разбор ИИ от /)).toBeVisible();
    await page.getByRole("button", { name: "Что получил ИИ" }).click();
    await expect(page.getByAltText("Страница 1 · solution.png")).toBeVisible();
    await page.getByRole("button", { name: "Показать шаг 1 в оригинале" }).click();
    await expect(page.locator(".focus-box")).toBeVisible();

    await page.getByRole("button", { name: "Изменить шаг 1" }).click();
    await page
      .getByRole("dialog")
      .locator('math-field[aria-label="Формула шага 1"]')
      .evaluate((element) => {
        const field = element as HTMLElement & { value: string };
        field.value = "x=1";
        field.dispatchEvent(new Event("input", { bubbles: true }));
      });
    await page.getByRole("button", { name: "Сохранить шаг" }).click();
    await page
      .getByRole("radiogroup", { name: "Вердикт шага 1" })
      .getByRole("radio", { name: "Верно" })
      .click();
    await page.getByRole("button", { name: "Запустить разбор" }).first().click();
    const rerun = page.getByRole("dialog", { name: "Запустить разбор заново?" });
    await expect(rerun).toBeVisible();
    await rerun.getByRole("button", { name: "Отмена" }).click();
    await expect(rerun).toHaveCount(0);
    await page.getByRole("button", { name: "Всё сверено" }).click();
    await page.getByRole("button", { name: "Отметить проверенной" }).click();
    await page.getByRole("button", { name: "Опубликовать результат", exact: true }).click();
    await expect(page.getByText("Версия 1 опубликована")).toBeVisible();

    await page.reload();
    await expect(page.getByRole("link", { name: "Отчёт, версия 1" })).toBeVisible();
    await page.getByRole("link", { name: "Отчёт, версия 1" }).click();
    await waitForReport(page, 1);
    await expect(page.getByRole("main")).toContainText("Решите x + 1 = 2");

    await page.getByRole("button", { name: "Выйти" }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.getByLabel("Почта").fill(email);
    await page.getByLabel("Пароль").fill(password);
    await page.getByRole("button", { name: "Войти", exact: true }).click();
    await expect(page).toHaveURL(/\/works\/[0-9a-f-]{36}\/report$/);
    await waitForReport(page, 1);
    await page.goto("/works");
    await page.getByRole("button", { name: /^Все 1/ }).click();
    await expect(page.getByRole("link", { name: /Контрольная по уравнениям/ })).toBeVisible();
  },
);
