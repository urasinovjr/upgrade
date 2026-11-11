import { expect, test } from "./test";
import { addStudent, csrfHeaders, password, signUp } from "./setup";

for (const mobile of [false, true]) {
  test(
    "homework invite, student upload and published review" + (mobile ? " @mobile" : ""),
    async ({ page, request, browser }) => {
      test.setTimeout(180_000);
      await signUp(page, request, "homework");
      const studentId = await addStudent(page, "Ученик ДЗ");
      await page.goto("/homework");
      await page.getByRole("button", { name: "Создать ДЗ", exact: true }).click();
      await page
        .getByRole("textbox", { name: "Текст для распознавания" })
        .fill("Вычислите 1/2 + 1/3.");
      await page.getByRole("button", { name: "Распознать условия", exact: true }).click();
      await page
        .getByRole("button", { name: "Добавить распознанные задания" })
        .click({ timeout: 30_000 });
      await page.getByRole("checkbox", { name: "Условие сверено с оригиналом" }).check();
      await page.getByRole("button", { name: "Сохранить черновик" }).click();
      await expect(page.getByText("Есть несохранённые изменения")).toHaveCount(0);
      await page.getByRole("button", { name: "К назначению" }).click();
      await page.getByRole("checkbox", { name: /Ученик ДЗ/ }).check();
      await page.getByRole("button", { name: "Назначить ученикам" }).click();
      await expect(page.getByRole("heading", { name: "Назначения", exact: true })).toBeVisible();
      const headers = await csrfHeaders(page);
      const invitation = await page.request.post("/api/students/" + studentId + "/invitation", {
        headers,
      });
      expect(invitation.ok()).toBe(true);
      const learnerContext = await browser.newContext({
        baseURL: new URL(page.url()).origin,
        viewport: page.viewportSize() ?? undefined,
      });
      const learner = await learnerContext.newPage();
      try {
        const invitationUrl = new URL((await invitation.json()).url);
        await learner.goto(invitationUrl.pathname + invitationUrl.hash);
        await learner.getByLabel("Пароль", { exact: true }).fill(password);
        await learner.getByRole("button", { name: "Задать пароль" }).click();
        await expect(
          learner.getByText("Доступ активирован. Сохраните логин для следующих входов"),
        ).toBeVisible();
        const login = await learner.getByRole("textbox", { name: "Ваш логин" }).inputValue();
        expect(login).toMatch(/^u/);
        await learner.getByRole("link", { name: "Открыть мои ДЗ" }).click();
        await learner.getByRole("button", { name: "Открыть задания" }).click();
        await learner
          .getByLabel("Фотографии решения")
          .setInputFiles(["e2e/fixtures/solution.png", "e2e/fixtures/solution.png"]);
        await expect(learner.getByRole("button", { name: "Убрать", exact: true })).toHaveCount(2);
        await learner.reload();
        await learner.getByRole("button", { name: "Открыть задания" }).click();
        await expect(learner.getByRole("button", { name: "Убрать", exact: true })).toHaveCount(2);
        await learner.getByRole("button", { name: "Отправить ДЗ целиком" }).click();
        await expect(learner.getByRole("button", { name: "Ожидает проверки" })).toBeDisabled();
        const state = await (await page.request.get("/api/state")).json();
        const work = state.works.find(
          (work: { studentId: string }) => work.studentId === studentId,
        );
        expect(work.taskFiles[work.draft.tasks[0].id]).toHaveLength(2);
        const layout = work.attachments.map((file: { id: string; pageOrder: number[] }) => ({
          id: file.id,
          pageOrder: file.pageOrder,
          checkedPages: file.pageOrder,
          masks: {},
          crops: {},
        }));
        expect(
          (
            await page.request.put("/api/works/" + work.id + "/attachments", {
              headers,
              data: layout,
            })
          ).ok(),
        ).toBe(true);
        expect(
          (await page.request.post("/api/works/" + work.id + "/actions/analyse", { headers })).ok(),
        ).toBe(true);
        await expect
          .poll(
            async () => (await (await page.request.get("/api/works/" + work.id)).json()).status,
            { timeout: 60_000 },
          )
          .toBe("ready");
        await page.goto("/works/" + work.id);
        await page
          .getByRole("combobox", { name: "Результат задания", exact: true })
          .selectOption("needs_clarification");
        await page
          .getByRole("textbox", { name: "Комментарий для ученика", exact: true })
          .fill("Поясните переход ко второй строке.");
        await expect(page.getByText("Сохранено", { exact: true })).toBeVisible({ timeout: 15_000 });
        const draftUrl = "**/api/works/" + work.id + "/draft";
        let resumeSave = () => {};
        const pausedSave = new Promise<void>((resolve) => {
          resumeSave = resolve;
        });
        let pauseNextSave = true;
        await page.route(draftUrl, async (route) => {
          if (pauseNextSave) {
            pauseNextSave = false;
            await pausedSave;
          }
          await route.continue();
        });
        const saving = page.waitForRequest((request) => request.url().endsWith(work.id + "/draft"));
        await page.getByRole("button", { name: "Отметить проверенной" }).click();
        await saving;
        const publish = page.getByRole("button", { name: "Опубликовать результат", exact: true });
        try {
          await expect(page.getByText("Сохраняем…", { exact: true })).toBeVisible();
          await expect(publish).toBeEnabled();
          await publish.click();
        } finally {
          resumeSave();
        }
        await expect(page.getByText("Версия 1 опубликована")).toBeVisible();
        await learner.reload();
        await expect(learner.getByRole("button", { name: "Сдать ещё раз" })).toBeVisible();
        await learner.getByText("Задание 1 · Нужно уточнить", { exact: true }).click();
        await expect(learner.getByText("Поясните переход ко второй строке.")).toBeVisible();
        const pupilSession = await (await learner.request.get("/api/student/session")).json();
        expect((await learner.request.get("/api/works/" + work.id)).status()).toBe(403);
        expect(
          (
            await learner.request.post("/api/student/activate", {
              data: { token: invitationUrl.hash.slice(1), password },
              headers: { "X-CSRF-Token": pupilSession.csrfToken },
            })
          ).status(),
        ).toBe(400);
      } finally {
        await learnerContext.close();
      }
    },
  );
}
