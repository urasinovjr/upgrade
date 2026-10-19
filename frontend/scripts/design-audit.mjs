import { chromium, webkit } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
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
const url = (
  options.url ??
  pathToFileURL(fileURLToPath(new URL("../../output/UpGrade.html", import.meta.url))).href
).split("#")[0];
const hashRoutes = !/^https?:/.test(url);
const address = (route) => (hashRoutes ? url + "#/" + route : new URL(route, url + "/").href);
const out = options.out ?? fileURLToPath(new URL("../../output/playwright/mvp/", import.meta.url));
const browsers = list(options.browsers, ["chromium", "webkit"]);
const widths = list(options.widths, ["390", "768", "1024", "1440"]).map(Number);
const routes = list(options.routes, [
  "dashboard",
  "works",
  "works/demo-ready",
  "students",
  "students/anna",
  "works/new",
  "works/demo-confirmed/report",
]);
const scenes = list(options.scenes, ["filled"]);
const height = (width) => (width <= 700 ? 844 : 900);
await mkdir(out, { recursive: true });

const emptyState = async (page) => {
  await page.evaluate(async () => {
    const request = indexedDB.open("upgrade-demo");
    const db = await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const tx = db.transaction("state", "readwrite");
    tx.objectStore("state").put({ works: [], students: [], closures: [] }, "root");
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  });
};
const failingReads = () => {
  const original = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (...args) {
    if (this.name === "state") throw new Error("Тестовая ошибка чтения.");
    return original.apply(this, args);
  };
};

function relativeLuminance([r, g, b]) {
  const channel = (value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

async function settle(page) {
  await page.locator("h1").first().waitFor({ state: "attached", timeout: 15_000 });
  await page.locator("[aria-busy=true]").first().waitFor({ state: "detached", timeout: 15_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(500);
}

async function metrics(page) {
  const raw = await page.evaluate(() => {
    const parse = (value) =>
      value
        .match(/[\d.]+/g)
        ?.slice(0, 4)
        .map(Number) ?? [0, 0, 0, 0];
    const background = (element) => {
      for (let node = element; node; node = node.parentElement) {
        const color = parse(getComputedStyle(node).backgroundColor);
        if ((color[3] ?? 1) > 0.9) return color.slice(0, 3);
      }
      return [255, 255, 255];
    };
    const texts = [];
    const narrow = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const element = node.parentElement;
      if (!element || !node.textContent.trim()) continue;
      const style = getComputedStyle(element);
      if (style.visibility === "hidden" || style.display === "none") continue;
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      if (element.closest("[aria-hidden=true], svg, math-field, .katex, [inert]")) continue;
      if (box.width <= 1 && box.height <= 1) continue;
      if (box.width < 60 && box.height > 80 && node.textContent.trim().length > 6)
        narrow.push(node.textContent.trim().slice(0, 40));
      texts.push({
        text: node.textContent.trim().slice(0, 30),
        size: parseFloat(style.fontSize),
        weight: Number(style.fontWeight),
        color: parse(style.color).slice(0, 3),
        background: background(element),
        disabled: Boolean(element.closest("button:disabled, [aria-disabled=true]")),
      });
    }
    const firstRow = document.querySelector(".work-row");
    const confirm = document.querySelector("[data-audit=confirm-work]");
    const top = (element) =>
      element ? Math.round(element.getBoundingClientRect().top + scrollY) : null;
    const confirmBox = confirm?.getBoundingClientRect();
    return {
      viewport: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      headings: document.querySelectorAll("h1").length,
      narrow,
      texts,
      firstQueueRowTop: top(firstRow),
      confirmVisible: confirmBox
        ? confirmBox.top >= 0 && confirmBox.bottom <= innerHeight && confirmBox.width > 0
        : null,
      fontSizes: [...new Set(texts.map((text) => text.size))].sort((a, b) => a - b),
    };
  });
  const contrast = [];
  for (const text of raw.texts) {
    if (text.disabled) continue;
    const l1 = relativeLuminance(text.color);
    const l2 = relativeLuminance(text.background);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const large = text.size >= 24 || (text.size >= 18.66 && text.weight >= 700);
    if (ratio < (large ? 3 : 4.5)) contrast.push({ text: text.text, ratio: +ratio.toFixed(2) });
  }
  delete raw.texts;
  return { ...raw, overflow: raw.scrollWidth > raw.viewport + 1, lowContrast: contrast };
}

const report = [];
for (const name of browsers) {
  const browserType = name === "webkit" ? webkit : chromium;
  const browser = await browserType.launch(name === "chromium" ? { channel: "chrome" } : {});
  for (const width of widths) {
    for (const scene of scenes) {
      const context = await browser.newContext({ viewport: { width, height: height(width) } });
      if (scene === "error") await context.addInitScript(failingReads);
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost)/, (route) => route.abort());
      if (scene === "empty") {
        await page.goto(address("dashboard"));
        await settle(page);
        await emptyState(page);
        await page.reload();
      }
      for (const route of routes) {
        await page.goto(address(route));
        await settle(page);
        const slug = route.replaceAll("/", "-");
        const file = `${out}/${name}-${slug}-${scene}-${width}.png`.replace("//", "/");
        await page.screenshot({
          path: file,
          animations: "disabled",
          fullPage: Boolean(options.full),
        });
        report.push({
          browser: name,
          width,
          route,
          scene,
          file,
          ...(await metrics(page)),
          errors: [...errors],
        });
      }
      await context.close();
    }
  }
  await browser.close();
}
await writeFile(`${out}/design-audit.json`, JSON.stringify(report, null, 2));
for (const row of report) {
  const issues = [
    row.overflow && "overflow",
    row.headings !== 1 && "h1:" + row.headings,
    row.narrow.length && "narrow-text:" + row.narrow.join("|"),
    row.lowContrast.length &&
      "low-contrast:" + row.lowContrast.map((item) => item.text + " " + item.ratio).join("|"),
    row.errors.length && "errors:" + row.errors.join("|"),
    row.confirmVisible === false && "confirm-hidden",
  ].filter(Boolean);
  console.log(
    `${row.browser} ${row.width} ${row.route} ${row.scene}` +
      ` queueTop=${row.firstQueueRowTop ?? "-"} fonts=${row.fontSizes.join("/")}` +
      (issues.length ? "  ⚠ " + issues.join("  ") : "  ok"),
  );
}
if (report.some((row) => row.overflow || row.headings !== 1 || row.errors.length))
  process.exitCode = 1;
