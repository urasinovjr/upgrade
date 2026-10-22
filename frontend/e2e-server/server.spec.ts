import { expect, test, type Page } from "@playwright/test";
import { mailedLink, uniqueEmail } from "./mailbox";

const password = "correct horse 42";

async function register(page: Page, email: string) {
  await page.goto("/register");
  await page.getByLabel("Как к вам обращаться").fill("Анна Петровна");
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("checkbox", { name: /условия использования/ }).check();
  await page.getByRole("checkbox", { name: /обработку персональных данных/ }).check();
  await page.getByRole("button", { name: "Создать аккаунт" }).click();
  await expect(page.getByRole("heading", { name: "Проверьте почту" })).toBeVisible();
}

test("teacher registers, uploads a work, runs analysis and confirms it", async ({
  page,
  request,
}) => {
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

  await page.goto("/works/new");
  const studentSelect = page.getByLabel("Ученик", { exact: true });
  const studentId = await studentSelect
    .locator("option", { hasText: "Мария" })
    .getAttribute("value");
  await studentSelect.selectOption(studentId!);
  await page.getByRole("textbox", { name: "Название работы" }).fill("Контрольная по уравнениям");
  await page.getByLabel("Загрузить решение").setInputFiles("e2e/fixtures/solution.png");
  await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
  await page.getByRole("button", { name: "Скрыть данные" }).click();
  await page.getByRole("button", { name: "Добавить маску" }).click();
  await page.getByRole("button", { name: "Отметить страницу проверенной" }).click();
  await expect(page.getByText("Проверено 1 из 1")).toBeVisible();
  await page.getByRole("button", { name: "Создать работу и открыть разбор" }).click();
  await expect(page).toHaveURL(/\/works\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Страница проверена", { exact: true })).toBeVisible();
  await expect(page.locator(".mask-box")).toHaveCount(1);

  await page.getByRole("button", { name: "Запустить разбор" }).first().click();
  await expect(page.getByRole("button", { name: "Запустить разбор" })).toHaveCount(0, {
    timeout: 30_000,
  });
  await page.getByRole("button", { name: "Исходный разбор" }).click();
  await expect(page.getByText(/Разбор ИИ: sim-draft · промпт sim-1/)).toBeVisible();
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
  await page.getByRole("button", { name: "Применить правку" }).click();
  await page
    .getByRole("radiogroup", { name: "Вердикт шага 1" })
    .getByRole("radio", { name: "Верно" })
    .click();
  await page.getByRole("button", { name: "Запустить разбор" }).first().click();
  const rerun = page.getByRole("dialog", { name: "Запустить разбор заново?" });
  await expect(rerun).toBeVisible();
  await rerun.getByRole("button", { name: "Отмена" }).click();
  await expect(rerun).toHaveCount(0);
  await page.getByRole("button", { name: "Завершить сверку" }).click();
  await page.getByRole("button", { name: "Отметить задачу проверенной" }).click();
  await page.getByRole("button", { name: "Подтвердить работу", exact: true }).click();
  await expect(page.getByText("Редакция 1 подтверждена")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("link", { name: "Отчёт · v1" })).toBeVisible();
  await page.getByRole("link", { name: "Отчёт · v1" }).click();
  await expect(page.getByRole("main")).toContainText("Решите x + 1 = 2");

  await page.getByRole("button", { name: "Выйти" }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.getByLabel("Почта").fill(email);
  await page.getByLabel("Пароль").fill(password);
  await page.getByRole("button", { name: "Войти", exact: true }).click();
  await expect(page).toHaveURL(/\/works\/[0-9a-f-]{36}\/report$/);
  await page.goto("/works");
  await page.getByRole("button", { name: /^Все 1/ }).click();
  await expect(page.getByRole("link", { name: /Контрольная по уравнениям/ })).toBeVisible();
});

test("another teacher does not see the first teacher's data", async ({ page, request }) => {
  const email = uniqueEmail("other");
  await register(page, email);
  await page.goto(await mailedLink(request, email));
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto("/works");
  await expect(page.getByRole("heading", { name: "Работы", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Все \d/ })).toHaveCount(0);
  await expect(page.getByRole("link", { name: /Контрольная по уравнениям/ })).toHaveCount(0);
});
