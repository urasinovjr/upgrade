import { writeDemo } from "../e2e/onboarding";
import { demoUrl, expect, test } from "./fixtures";
import { auditPage, capture } from "./audit";
import type { Homework } from "../src/domain/homework";
import type { Page } from "@playwright/test";

test.use({ baseURL: demoUrl });

const homework: Homework = {
  id: "homework-visual",
  title: "Планиметрия: треугольники",
  revision: 1,
  assignedAt: null,
  deadline: null,
  createdAt: "2026-03-16T06:00:00Z",
  files: [],
  assignments: [],
  tasks: [
    {
      id: "task-visual",
      title: "Равнобедренный треугольник",
      condition:
        "В треугольнике ABC стороны AB и AC равны. Докажите, что углы при основании BC равны.",
      formula: "AB=AC",
      topicId: "triangles",
      taskTypeId: "geometry_proof",
      conditionFileIds: [],
      confirmed: true,
    },
  ],
};

async function prepare(page: Page, mode: string) {
  await page.goto("/homework");
  await expect(page.getByRole("heading", { name: "Домашние задания", exact: true })).toBeVisible();
  if (mode === "empty") return;
  const item = structuredClone(homework);
  if (mode === "source") item.tasks = [];
  if (mode === "assigned" || mode === "upload" || mode === "student") {
    item.assignedAt = "2026-03-16T06:00:00Z";
    item.assignments = [{ id: "assignment-visual", studentId: "anna" }];
  }
  await writeDemo(page, "preferences", "homework", [item]);
  await page.goto(mode === "student" ? "/student?demo=anna" : "/homework/" + item.id);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  if (mode === "student") await page.getByRole("button", { name: "Открыть задания" }).click();
  if (mode === "assign")
    await page.getByRole("button", { name: "Назначение", exact: true }).click();
  if (mode === "upload") await page.getByRole("button", { name: "Загрузить за ученика" }).click();
}

for (const mode of ["empty", "source", "editor", "assign", "assigned", "upload", "student"]) {
  for (const width of [390, 768, 1024, 1440]) {
    test(
      "homework " + mode + " " + width,
      { tag: width === 390 ? "@mobile" : "@desktop" },
      async ({ page }) => {
        if (width !== 390) await page.setViewportSize({ width, height: 900 });
        await prepare(page, mode);
        await capture(page, "homework-" + mode + "-" + width);
      },
    );
  }
}

test("homework responsive range", { tag: "@sweep" }, async ({ page }) => {
  await prepare(page, "editor");
  for (const width of [320, 390, 700, 701, 768, 1000, 1024, 1200, 1440, 1920]) {
    await page.setViewportSize({ width, height: 900 });
    await auditPage(page);
  }
});
