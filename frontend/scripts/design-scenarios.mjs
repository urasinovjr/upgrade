import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";

const options = Object.fromEntries(
  process.argv
    .slice(2)
    .join(" ")
    .split("--")
    .filter(Boolean)
    .map((part) => {
      const [key, ...value] = part.trim().split(" ");
      return [key, value.join(" ") || "true"];
    }),
);
const list = (value, fallback) => (value ? value.split(",").filter(Boolean) : fallback);
const base = (
  options.url ??
  pathToFileURL(fileURLToPath(new URL("../../output/UpGrade.html", import.meta.url))).href
).split("#")[0];
const hashRoutes = !/^https?:/.test(base);
const address = (route) => (hashRoutes ? base + "#/" + route : new URL(route, base + "/").href);
const shots =
  options.shots ?? fileURLToPath(new URL("../../output/playwright/mvp/", import.meta.url));
const fixtures = fileURLToPath(new URL("../e2e/fixtures/", import.meta.url));
const scratch = options.scratch ?? tmpdir() + "/upgrade-design-scenarios";
const browsers = list(options.browsers, ["chromium", "webkit"]);
await mkdir(shots, { recursive: true });
await mkdir(scratch, { recursive: true });

class Failure extends Error {}
function check(condition, message) {
  if (!condition) throw new Failure(message);
}
const pause = (page, ms = 350) => page.waitForTimeout(ms);
const button = (page, name, exact = true) => page.getByRole("button", { name, exact });
const rows = (page) => page.locator(".work-row");
const confirmWork = (page) => page.locator("[data-audit=confirm-work]");
const activeLabel = (page) =>
  page.evaluate(() => document.activeElement?.getAttribute("aria-label") ?? "");
const route = (page) => decodeURI(hashRoutes ? new URL(page.url()).hash.slice(2) : page.url());
async function settle(page) {
  await page.locator("h1").first().waitFor({ state: "attached" });
  await page.locator("[aria-busy=true]").first().waitFor({ state: "detached" });
  await pause(page, 250);
}
async function open(page, path) {
  await page.goto(address(path));
  await settle(page);
}
async function reload(page) {
  await page.reload();
  await settle(page);
}
async function heading(page, name) {
  await page.getByRole("heading", { level: 1, name, exact: true }).waitFor();
}
async function closeDialog(page, action) {
  await action();
  await page.getByRole("dialog").waitFor({ state: "hidden" });
}
async function segmentCount(page, label) {
  const text = await page
    .getByRole("group", { name: "Фильтр работ" })
    .getByRole("button", { name: new RegExp("^" + label) })
    .innerText();
  return Number(text.match(/\d+/)?.[0]);
}
async function setFormula(page, label, value) {
  await page
    .getByRole("dialog")
    .locator(`math-field[aria-label="${label}"]`)
    .evaluate((element, latex) => {
      element.value = latex;
      element.dispatchEvent(new Event("input", { bubbles: true }));
    }, value);
}
async function until(read, message, timeout = 4000) {
  const end = Date.now() + timeout;
  while (!(await read())) {
    if (Date.now() > end) throw new Failure(message);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}
const rowCount = (page, count, message) =>
  until(async () => (await rows(page).count()) === count, message);
const attribute = (locator, name, value, message) =>
  until(async () => (await locator.getAttribute(name)) === value, message);
async function selectTask(page, number) {
  const tab = page.getByRole("tab", { name: "Задача " + number, exact: true });
  await tab.click();
  await attribute(tab, "aria-selected", "true", "Task " + number + " not selected");
}
async function editStep(page, number) {
  await page
    .locator(".dp-step")
    .nth(number - 1)
    .hover();
  await button(page, "Изменить шаг " + number).click();
  await page.getByRole("dialog").waitFor();
}
async function saved(page) {
  await page
    .locator(".dp-save-state")
    .filter({ hasText: /^Сохранено$/ })
    .waitFor();
}

const scenarios = {
  async queue(page) {
    await open(page, "dashboard");
    await page.getByRole("link", { name: "К проверке: 1", exact: true }).click();
    await heading(page, "Работы");
    check(route(page).includes("status=ready"), "KPI did not filter the queue");
    await rowCount(page, 1, "Status filter mismatch");
    await reload(page);
    check(
      (await page.getByRole("combobox", { name: "Статус" }).inputValue()) === "ready",
      "Filter lost after reload",
    );
    await rowCount(page, 1, "Filtered queue changed after reload");
    await button(page, "Сбросить фильтры").click();
    const all = await segmentCount(page, "Все");
    await rowCount(page, all, "Reset should show all works");
    await page.getByLabel("Поиск работ").fill("Анна");
    await rowCount(page, 2, "Search by student name");
    await page.getByLabel("Поиск работ").fill("нет такой работы");
    await page.getByText("Работы не найдены").waitFor();
    await button(page, "Сбросить фильтры").click();
    await rowCount(page, all, "Reset from empty search");
    await page
      .getByRole("group", { name: "Фильтр работ" })
      .getByRole("button", { name: /^Требуют внимания/ })
      .click();
    const attention = await segmentCount(page, "Требуют внимания");
    await rowCount(page, attention, "Attention segment count mismatch");
    await page
      .getByRole("group", { name: "Фильтр по состоянию" })
      .getByRole("button", { name: /К проверке/ })
      .click();
    await rowCount(page, 1, "Chart status filter mismatch");
    await button(page, "Сбросить фильтры").click();
    await page.locator(".dp-bars button").first().click();
    await rowCount(page, 0, "Empty day mismatch");
    await button(page, "Сбросить фильтры").click();
    await rows(page).filter({ hasText: "Уравнения и преобразования" }).click();
    await heading(page, "Уравнения и преобразования");
    check(route(page).endsWith("works/demo-ready"), "Queue row did not open the review");
    await button(page, "Найти работу").click();
    await page.waitForFunction(
      () => document.activeElement?.getAttribute("aria-label") === "Поиск работ",
    );
    await button(page, "Новая работа").click();
    await heading(page, "Новая работа");
  },

  async edit(page) {
    await open(page, "works/demo-ready");
    await selectTask(page, 1);
    await editStep(page, 1);
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Объяснение" }).fill("Разложили на множители.");
    await closeDialog(page, () => button(page, "Сохранить шаг").click());
    check((await activeLabel(page)) === "Изменить шаг 1", "Focus not restored after save");
    await editStep(page, 2);
    await dialog.getByRole("textbox", { name: "Объяснение" }).fill("Не сохранять");
    await closeDialog(page, () => button(page, "Отмена").click());
    check((await activeLabel(page)) === "Изменить шаг 2", "Focus not restored after cancel");
    check(!(await page.locator(".dp-callout-warning").count()), "Callout before a formula change");
    await editStep(page, 2);
    await setFormula(page, "Формула шага 2", "x=2\\lor x=3");
    await closeDialog(page, () => button(page, "Сохранить шаг").click());
    await page.getByText("Сверьте распознанное с оригиналом.", { exact: true }).waitFor();
    check(await confirmWork(page).isDisabled(), "Stale work can be confirmed");
    await saved(page);
    await reload(page);
    check(
      (await page
        .getByRole("tab", { name: "Задача 1", exact: true })
        .getAttribute("aria-selected")) === "true",
      "Task lost after reload",
    );
    await page.locator(".dp-step-correct").first().locator(".dp-step-toggle").click();
    await page.getByText("Разложили на множители.").waitFor();
    check(!(await page.getByText("Не сохранять").count()), "Cancelled edit was saved");
    await page.getByText("Сверьте распознанное с оригиналом.", { exact: true }).waitFor();
    await button(page, "Всё сверено").click();
    await page
      .getByText("Сверьте распознанное с оригиналом.", { exact: true })
      .waitFor({ state: "detached" });
  },

  async verdict(page) {
    await open(page, "works/demo-ready");
    check(
      (await page
        .getByRole("tab", { name: "Задача 2", exact: true })
        .getAttribute("aria-selected")) === "true",
      "The task with an error should open first",
    );
    const group = page.getByRole("radiogroup", { name: "Вердикт шага 1" });
    await group.getByRole("radio", { name: "Ошибка" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    await page.waitForFunction(() => document.activeElement?.tagName === "TEXTAREA");
    check(
      await button(page, "Сохранить шаг").isDisabled(),
      "Error without explanation can be saved",
    );
    await closeDialog(page, () => button(page, "Отмена").click());
    check(
      (await group.getByRole("radio", { name: "Верно" }).getAttribute("aria-checked")) === "true",
      "Cancel changed the verdict",
    );
    await group.getByRole("radio", { name: "Ошибка" }).click();
    await dialog
      .getByRole("textbox", { name: "Объяснение" })
      .fill("Перед сокращением нужно учесть ОДЗ.");
    await closeDialog(page, () => button(page, "Сохранить шаг").click());
    await page.getByText("Перед сокращением нужно учесть ОДЗ.").waitFor();
    await saved(page);
    await reload(page);
    check(
      (await page
        .getByRole("radiogroup", { name: "Вердикт шага 1" })
        .getByRole("radio", { name: "Ошибка" })
        .getAttribute("aria-checked")) === "true",
      "Verdict lost after reload",
    );
    await page
      .getByRole("radiogroup", { name: "Вердикт шага 1" })
      .getByRole("radio", { name: "Верно" })
      .click();
    await dialog.waitFor();
    check(
      !(await dialog.getByRole("textbox", { name: "Объяснение" }).inputValue()),
      "Error explanation carried over to a correct step",
    );
    await closeDialog(page, () => button(page, "Сохранить шаг").click());
    await page.getByText("Перед сокращением нужно учесть ОДЗ.").waitFor({ state: "detached" });
  },

  async confirm(page) {
    await open(page, "works/demo-ready");
    await selectTask(page, 1);
    await button(page, "Отметить задачу проверенной").click();
    await selectTask(page, 2);
    await button(page, "Подтвердить пробел").click();
    await button(page, "Отметить задачу проверенной").click();
    await until(() => confirmWork(page).isEnabled(), "Confirm still blocked after both tasks");
    await confirmWork(page).click();
    await page.getByText("Версия 1 подтверждена", { exact: true }).waitFor();
    await reload(page);
    await page.getByText("Версия 1 подтверждена", { exact: true }).waitFor();
    await page.getByRole("link", { name: "Отчёт · v1" }).click();
    await heading(page, "Отчёт по работе");
    await page.getByRole("link", { name: "К разбору работы" }).click();
    await button(page, "Новая версия").click();
    await confirmWork(page).waitFor();
    await page.getByText("История версий · 1", { exact: true }).click();
    await page.getByRole("link", { name: "Версия 1 · текущая" }).click();
    await heading(page, "Отчёт по работе");
    check(route(page).includes("revision="), "History link lost the revision");
  },

  async report(page) {
    await open(page, "works/demo-confirmed/report");
    const download = page.waitForEvent("download");
    await button(page, "Скачать PDF").click();
    const file = await download;
    check((await file.suggestedFilename()).endsWith(".pdf"), "Report is not a PDF");
    await button(page, "Скопировать текст").click();
    const copied = button(page, "Скопировано");
    const manual = page.getByRole("textbox", { name: "Текст отчёта" });
    await copied.or(manual).first().waitFor();
    if (await manual.isVisible()) {
      check(
        (await manual.inputValue()).includes("Самостоятельная по рациональным дробям"),
        "Manual copy text is not the report",
      );
      await closeDialog(page, () => page.keyboard.press("Escape"));
    }
  },

  async next(page) {
    await open(page, "dashboard");
    const titles = await rows(page).locator(".work-name strong").allInnerTexts();
    await open(page, "works/demo-ready");
    const start = titles.indexOf("Уравнения и преобразования");
    check(start >= 0, "Demo work not in the attention queue");
    await page
      .locator(".dp-topbar")
      .getByText(`Работа ${start + 1} из ${titles.length}`)
      .waitFor();
    for (let offset = 1; offset <= titles.length; offset++) {
      await page
        .locator(".review-footer")
        .getByRole("button", { name: /Следующая работа/ })
        .click();
      await heading(page, titles[(start + offset) % titles.length]);
    }
  },

  async student(page, { engine }) {
    await open(page, "students/anna");
    await page.locator(".dp-evidence a").first().click();
    await page.getByRole("heading", { level: 1 }).waitFor();
    check(
      (await page
        .getByRole("tab", { name: "Задача 2", exact: true })
        .getAttribute("aria-selected")) === "true",
      "Evidence did not open its task",
    );
    await open(page, "students/anna");
    await page.getByRole("tab", { name: "Карта знаний", exact: true }).click();
    const node = button(page, "Логарифмы · Нет данных");
    await node.focus();
    await page.keyboard.press("Enter");
    await attribute(node, "aria-pressed", "true", "Enter did not select a topic");
    await until(() => route(page).includes("topic=logs"), "Selected topic not in the URL");
    check((await page.locator(".dp-map-edge.is-path").count()) > 0, "No prerequisite path");
    await button(page, "Степени · Нет данных").focus();
    await page.keyboard.press(" ");
    await page.locator(".dp-topic-detail h2", { hasText: "Степени" }).waitFor();
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await button(page, "Закрыть пробел").click();
    await page
      .getByLabel("Почему пробел закрыт")
      .fill("Самостоятельно решил три задачи с ограничениями.");
    await closeDialog(page, () =>
      page.getByRole("dialog").getByRole("button", { name: "Закрыть пробел" }).click(),
    );
    await button(page, "Открыть пробел снова").waitFor();
    await reload(page);
    await button(page, "Открыть пробел снова").waitFor();
    await page.getByRole("tab", { name: "История", exact: true }).click();
    await page.getByRole("heading", { name: "Пробел закрыт", exact: true }).waitFor();
    check(
      (await page.locator(".dp-timeline").innerText()).includes("Самостоятельно решил три задачи"),
      "Closure reason missing",
    );
    await page.getByRole("tab", { name: "Обзор", exact: true }).click();
    await button(page, "Открыть пробел снова").click();
    await button(page, "Закрыть пробел").waitFor();
    await page.getByRole("tab", { name: "История", exact: true }).click();
    await page.getByRole("heading", { name: "Пробел открыт снова", exact: true }).waitFor();
    check(
      (await page.locator(".dp-timeline li").first().getAttribute("data-kind")) === "reopen",
      "Timeline order wrong",
    );
    await pause(page);
    await page.screenshot({ path: `${shots}/${engine}-timeline-1440.png`, animations: "disabled" });
    await page.getByRole("tab", { name: "Карта знаний", exact: true }).click();
    await page.getByRole("button", { name: /^Область допустимых значений · / }).click();
    await pause(page);
    await page.screenshot({ path: `${shots}/${engine}-map-1440.png`, animations: "disabled" });
  },

  async strip(page) {
    await open(page, "dashboard");
    await page
      .getByRole("link", { name: "Дроби ведёт к пробелу «Область допустимых значений»" })
      .click();
    await page.waitForURL(/students\/anna\?tab=map&topic=domain/);
    await page.waitForFunction(() =>
      document
        .querySelector(".dp-map-node.selected")
        ?.getAttribute("aria-label")
        ?.startsWith("Область допустимых значений"),
    );
    const path = await page
      .locator(".dp-map-node.is-prerequisite")
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("aria-label")));
    check(
      path.some((label) => label.startsWith("Дроби")),
      "Prerequisite not highlighted",
    );
  },

  async upload(page) {
    const jpg = scratch + "/solution.jpg";
    await page.setContent("<canvas width=400 height=300></canvas>");
    const data = await page.evaluate(() => {
      const canvas = document.querySelector("canvas");
      const context = canvas.getContext("2d");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, 400, 300);
      context.fillStyle = "#223";
      context.font = "28px serif";
      context.fillText("x + 1 = 2", 40, 80);
      context.fillText("x = 1", 40, 140);
      return canvas.toDataURL("image/jpeg").split(",")[1];
    });
    await writeFile(jpg, Buffer.from(data, "base64"));
    await open(page, "students");
    await button(page, "Добавить ученика").click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("textbox", { name: "Имя ученика" }).fill("Вера Новикова");
    await closeDialog(page, () =>
      dialog.getByRole("button", { name: "Сохранить ученика" }).click(),
    );
    await reload(page);
    await page.locator(".student-card").filter({ hasText: "Вера Новикова" }).waitFor();
    const files = { jpg, png: fixtures + "solution.png", pdf: fixtures + "solution.pdf" };
    for (const [type, path] of Object.entries(files)) {
      await open(page, "works/new");
      await page
        .getByRole("combobox", { name: "Ученик", exact: true })
        .selectOption({ label: "Вера Новикова · 10 класс" });
      await page
        .getByRole("textbox", { name: "Название работы" })
        .fill("Проверка загрузки " + type);
      await page.getByLabel("Загрузить решение").setInputFiles(path);
      await button(page, "Удалить solution." + type).waitFor();
      await page.getByRole("textbox", { name: "Условие текстом" }).fill("Решите x + 1 = 2");
      await button(page, "Создать работу и открыть разбор").click();
      await heading(page, "Проверка загрузки " + type);
      await saved(page);
      await reload(page);
      await heading(page, "Проверка загрузки " + type);
      const original = page.getByRole("tab", { name: "Оригинал", exact: true });
      if (await original.isVisible()) await original.click();
      if (type === "pdf") await page.locator(".dp-original canvas").waitFor();
      else await page.locator(".dp-original .source-image, .dp-original img").first().waitFor();
      check(await confirmWork(page).isDisabled(), "Blank upload can be confirmed");
    }
    await open(page, "works");
    await rows(page).filter({ hasText: "Проверка загрузки png" }).click();
    await heading(page, "Проверка загрузки png");
    await editStep(page, 1);
    await setFormula(page, "Формула шага 1", "x=1");
    await closeDialog(page, () => button(page, "Сохранить шаг").click());
    await page
      .getByRole("radiogroup", { name: "Вердикт шага 1" })
      .getByRole("radio", { name: "Верно" })
      .click();
    check(await confirmWork(page).isDisabled(), "Unreconciled upload can be confirmed");
    await button(page, "Всё сверено").click();
    await button(page, "Отметить задачу проверенной").click();
    await confirmWork(page).click();
    await page.getByText("Версия 1 подтверждена", { exact: true }).waitFor();
    await reload(page);
    await page.getByText("Версия 1 подтверждена", { exact: true }).waitFor();
  },

  async panel(page, { engine }) {
    await open(page, "works/demo-ready");
    const panel = page.locator(".dp-review-window");
    await button(page, "Увеличить оригинал").click();
    await page.locator(".dp-original").evaluate((element) => (window.__original = element));
    await button(page, "На весь экран приложения").click();
    await pause(page);
    check((await panel.getAttribute("data-mode")) === "expanded", "Not expanded");
    check(
      await page.locator(".dp-sidebar").evaluate((element) => element.closest("[inert]") !== null),
      "Shell not inert",
    );
    await page.screenshot({
      path: `${shots}/${engine}-review-expanded-1440.png`,
      animations: "disabled",
    });
    await editStep(page, 1);
    await page.getByRole("dialog").waitFor();
    await closeDialog(page, () => page.keyboard.press("Escape"));
    check((await panel.getAttribute("data-mode")) === "expanded", "Dialog Escape closed the panel");
    check((await activeLabel(page)) === "Изменить шаг 1", "Dialog focus not restored");
    await page.keyboard.press("Escape");
    await pause(page);
    check((await panel.getAttribute("data-mode")) === "normal", "Escape did not restore the panel");
    check(
      await page.locator(".dp-sidebar").evaluate((element) => element.closest("[inert]") === null),
      "Shell stayed inert",
    );
    await button(page, "Свернуть панель").click();
    await pause(page);
    check(
      await panel.locator(".dp-window-reveal").evaluate((element) => element.inert),
      "Collapsed content not inert",
    );
    await button(page, "Развернуть содержимое").click();
    await pause(page);
    check(
      await page.locator(".dp-original").evaluate((element) => element === window.__original),
      "Original remounted",
    );
    check((await page.locator(".dp-original .media-zoom").innerText()) !== "100%", "Zoom lost");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await button(page, "На весь экран приложения").click();
    check(
      (await panel.evaluate((element) => element.getAnimations().length)) === 0,
      "Reduced motion still animates",
    );
    await page.keyboard.press("Escape");
    await pause(page);
    await button(page, "Закрыть панель").click();
    await heading(page, "Работы");
    await button(page, "Свернуть навигацию").click();
    await pause(page);
    check((await page.locator(".dp-sidebar").boundingBox()).width < 80, "Sidebar not collapsed");
    await button(page, "Развернуть навигацию").click();
    await open(page, "students/anna?tab=map&topic=logs");
    await button(page, "На весь экран приложения").click();
    await pause(page);
    await button(page, "Закрыть панель").focus();
    await page.keyboard.press("Shift+Tab");
    check(
      await page.evaluate(() => Boolean(document.activeElement?.closest(".dp-window"))),
      "Focus escaped the expanded map",
    );
    await button(page, "Вернуть размер панели").click();
    await button(page, "Закрыть панель").click();
    await page.waitForFunction(
      () => document.querySelector("[role=tab][aria-selected=true]")?.textContent === "Обзор",
    );
  },

  async keyboard(page, { engine }) {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page, "works/demo-ready");
    await page.getByRole("tab", { name: "Разбор", exact: true }).click();
    await editStep(page, 1);
    const field = page.getByRole("dialog").locator("math-field");
    await field.focus();
    await field.locator("[part=virtual-keyboard-toggle]").click();
    const before = await field.evaluate((element) => element.value);
    await page.locator('.dp-formula-keyboard .MLK__keycap[aria-label="7"]:visible').click();
    check(before !== (await field.evaluate((element) => element.value)), "Keyboard did not edit");
    const bounds = await page.getByRole("dialog").boundingBox();
    check(bounds.x >= 0 && bounds.x + bounds.width <= 390, "Dialog exceeds the viewport");
    await page.screenshot({
      path: `${shots}/${engine}-review-keyboard-390.png`,
      animations: "disabled",
    });
    await closeDialog(page, () => button(page, "Отмена").click());
    check(!(await page.evaluate(() => window.mathVirtualKeyboard.visible)), "Keyboard stayed open");
    check((await activeLabel(page)) === "Изменить шаг 1", "Focus not restored");
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await pause(page);
    const confirm = await confirmWork(page).boundingBox();
    check(confirm && confirm.y + confirm.height <= 844, "Confirm bar not visible after scrolling");
  },
};

const only = list(options.only, Object.keys(scenarios));
const results = [];
for (const engine of browsers) {
  const browser = await (engine === "webkit" ? webkit : chromium).launch(
    engine === "chromium" ? { channel: "chrome" } : {},
  );
  for (const name of only) {
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      acceptDownloads: true,
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.setDefaultTimeout(8000);
    const started = Date.now();
    let error = "";
    try {
      await scenarios[name](page, { engine });
      if (errors.length) error = "page errors: " + errors.join(" | ");
    } catch (caught) {
      error = caught instanceof Failure ? caught.message : String(caught.message).split("\n")[0];
      await page
        .screenshot({ path: `${scratch}/fail-${engine}-${name}.png` })
        .catch(() => undefined);
    }
    results.push({ engine, name, ok: !error, error, ms: Date.now() - started });
    console.log(
      `${engine} ${name.padEnd(9)} ${error ? "FAIL " + error : "ok"} (${Date.now() - started} ms)`,
    );
    await context.close();
  }
  await browser.close();
}
await writeFile(`${shots}/design-scenarios.json`, JSON.stringify(results, null, 2));
if (results.some((result) => !result.ok)) process.exitCode = 1;
