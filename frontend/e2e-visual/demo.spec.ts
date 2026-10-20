import path from "node:path";
import type { Page } from "@playwright/test";
import { demoUrl, expect, test } from "./fixtures";
import { allWidths, checkScreens, phone, type Screen } from "./screens";

test.use({ baseURL: demoUrl });

const review = { fullPage: false };

async function customize(page: Page) {
  await page.getByRole("button", { name: "Настроить", exact: true }).click();
  await expect(page.getByRole("button", { name: "Готово" })).toBeVisible();
}

async function openDialog(page: Page, name: string | RegExp) {
  await page
    .getByRole("button", { name, exact: typeof name === "string" })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
}

const screens: Screen[] = [
  { name: "dashboard", path: "/dashboard", widths: allWidths },
  { name: "dashboard-edit", path: "/dashboard", widths: [phone, 1440], prepare: customize },
  {
    name: "dashboard-catalog",
    path: "/dashboard",
    widths: [phone, 1440],
    prepare: async (page) => {
      await customize(page);
      await openDialog(page, "Добавить виджет");
    },
  },
  { name: "works-attention", path: "/works", widths: allWidths },
  { name: "works-all", path: "/works?view=all", widths: [1440] },
  { name: "works-confirmed", path: "/works?view=confirmed", widths: [1440] },
  {
    name: "works-not-found",
    path: "/works?view=all",
    widths: [phone, 1440],
    prepare: async (page) => {
      await page.getByLabel("Поиск работ").fill("контрольная по геометрии");
      await expect(page.getByText("Работы не найдены")).toBeVisible();
    },
  },
  { name: "new-work", path: "/works/new", widths: allWidths },
  {
    name: "new-work-file",
    path: "/works/new",
    widths: [phone, 1440],
    prepare: async (page) => {
      await page
        .getByLabel("Загрузить решение")
        .setInputFiles(path.join(import.meta.dirname, "../e2e/fixtures/solution.png"));
      await expect(page.getByRole("list", { name: "Добавленные файлы" })).toBeVisible();
    },
  },
  {
    name: "review-ready",
    path: "/works/demo-ready",
    widths: [phone, 768, 1024, 1199, 1200, 1440],
    capture: review,
  },
  { name: "review-input", path: "/works/demo-input", widths: [phone, 1440], capture: review },
  { name: "review-failed", path: "/works/demo-failed", widths: [1440], capture: review },
  {
    name: "review-preparation",
    path: "/works/demo-preparation",
    widths: [1440],
    capture: review,
  },
  {
    name: "review-confirmed",
    path: "/works/demo-confirmed",
    widths: [phone, 1440],
    capture: review,
  },
  {
    name: "review-edit-step",
    path: "/works/demo-ready",
    widths: [phone, 1440],
    prepare: (page) => openDialog(page, "Изменить шаг 1"),
    capture: { ...review, mask: ["math-field"] },
  },
  {
    name: "review-delete",
    path: "/works/demo-ready",
    widths: [1440],
    prepare: (page) => openDialog(page, "Удалить работу"),
    capture: review,
  },
  { name: "report", path: "/works/demo-confirmed/report", widths: [phone, 768, 1440] },
  { name: "students", path: "/students", widths: allWidths },
  {
    name: "students-archive",
    path: "/students/ivan",
    widths: [1440],
    prepare: async (page) => {
      await page.getByRole("button", { name: "В архив" }).click();
      await expect(page.getByRole("button", { name: "Вернуть из архива" })).toBeVisible();
      await page.goto("/students");
      await page.getByRole("button", { name: "Архив · 1" }).click();
      await expect(page.getByText("Иван Лебедев")).toBeVisible();
    },
  },
  {
    name: "student-form",
    path: "/students",
    widths: [phone, 1440],
    prepare: (page) => openDialog(page, "Добавить ученика"),
  },
  {
    name: "student-delete",
    path: "/students/anna",
    widths: [1440],
    prepare: (page) => openDialog(page, "Удалить"),
  },
  { name: "student", path: "/students/anna", widths: allWidths },
  { name: "student-map", path: "/students/anna?tab=map", widths: [phone, 1440] },
  { name: "student-history", path: "/students/anna?tab=history", widths: [phone, 1440] },
  { name: "not-found", path: "/missing-page", widths: [phone, 1440] },
  { name: "states", path: "/dev/states", widths: [1440], capture: { loading: true } },
];

checkScreens(screens);
