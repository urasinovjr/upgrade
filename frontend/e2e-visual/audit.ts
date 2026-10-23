import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

export interface CaptureOptions {
  fullPage?: boolean;
  headings?: number;
  loading?: boolean;
  mask?: string[];
}

const fullPageStyle = path.join(import.meta.dirname, "full-page.css");

interface TextSample {
  text: string;
  size: number;
  weight: number;
  color: number[];
  background: number[];
  disabled: boolean;
}

interface Layout {
  overflow: string[];
  headings: number;
  squeezed: string[];
  texts: TextSample[];
}

async function settleMedia() {
  await Promise.all([...document.fonts].map((font) => font.load().catch(() => undefined)));
  await document.fonts.ready;
  await Promise.all([...document.images].map((image) => image.decode().catch(() => undefined)));
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  scrollTo(0, 0);
}

function auditLayout(scope: string): Layout {
  const parse = (value: string) =>
    value
      .match(/[\d.]+/g)
      ?.slice(0, 4)
      .map(Number) ?? [0, 0, 0, 0];
  const background = (element: Element) => {
    for (let node: Element | null = element; node; node = node.parentElement) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if ((color[3] ?? 1) > 0.9) return color.slice(0, 3);
    }
    return [255, 255, 255];
  };
  const describe = (element: Element) =>
    element.tagName.toLowerCase() +
    "." +
    [...element.classList].join(".") +
    ' "' +
    (element.textContent ?? "").trim().slice(0, 30) +
    '"';
  const clipped = (element: Element) => {
    for (
      let node = element.parentElement;
      node && node !== document.body;
      node = node.parentElement
    ) {
      if (["auto", "hidden", "clip", "scroll"].includes(getComputedStyle(node).overflowX))
        return true;
    }
    return false;
  };
  const overflow: string[] = [];
  if (document.documentElement.scrollWidth > innerWidth + 1) {
    for (const element of document.body.querySelectorAll("*")) {
      const box = element.getBoundingClientRect();
      if (box.width && box.right > innerWidth + 1 && !clipped(element))
        overflow.push(describe(element));
    }
    if (!overflow.length) overflow.push("document " + document.documentElement.scrollWidth);
  }
  const texts: TextSample[] = [];
  const squeezed: string[] = [];
  const root = document.querySelector(scope) ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const element = node.parentElement;
    const text = (node.textContent ?? "").trim();
    if (!element || !text) continue;
    const style = getComputedStyle(element);
    if (style.visibility === "hidden" || style.display === "none") continue;
    const box = element.getBoundingClientRect();
    if (box.width <= 1 || box.height <= 1) continue;
    if (element.closest("[aria-hidden=true], svg, math-field, .ML__latex, [inert]")) continue;
    if (box.width < 60 && box.height > 80 && text.length > 6) squeezed.push(text.slice(0, 40));
    texts.push({
      text: text.slice(0, 30),
      size: parseFloat(style.fontSize),
      weight: Number(style.fontWeight),
      color: parse(style.color).slice(0, 3),
      background: background(element),
      disabled: Boolean(element.closest("button:disabled, [aria-disabled=true], :disabled")),
    });
  }
  return {
    overflow: overflow.slice(0, 10),
    headings: document.querySelectorAll("h1").length,
    squeezed,
    texts,
  };
}

function luminance(color: number[]) {
  const channel = (value: number) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(color[0]) + 0.7152 * channel(color[1]) + 0.0722 * channel(color[2]);
}

function lowContrast(texts: TextSample[]) {
  const found = new Set<string>();
  for (const text of texts) {
    if (text.disabled) continue;
    const light = luminance(text.color);
    const dark = luminance(text.background);
    const ratio = (Math.max(light, dark) + 0.05) / (Math.min(light, dark) + 0.05);
    const large = text.size >= 24 || (text.size >= 18.66 && text.weight >= 700);
    if (ratio < (large ? 3 : 4.5)) found.add(text.text + " " + ratio.toFixed(2));
  }
  return [...found];
}

export async function auditPage(page: Page, options: CaptureOptions = {}) {
  const headings = options.headings ?? 1;
  if (headings) await expect(page.locator("h1")).toHaveCount(headings);
  if (!options.loading) await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await page.evaluate(settleMedia);
  const scope = (await page.getByRole("dialog").count()) ? "[role=dialog]" : "body";
  const layout = await page.evaluate(auditLayout, scope);
  expect.soft(layout.overflow, "horizontal overflow").toEqual([]);
  expect.soft(layout.headings, "h1 count").toBe(headings);
  expect.soft(lowContrast(layout.texts), "text contrast").toEqual([]);
  expect.soft(layout.squeezed, "squeezed text").toEqual([]);
  return scope;
}

async function checkAccessibility(page: Page, scope: string) {
  const results = await new AxeBuilder({ page })
    .include(scope)
    .exclude("math-field")
    .disableRules(["color-contrast"])
    .analyze();
  const violations = results.violations
    .filter((violation) => violation.impact === "serious" || violation.impact === "critical")
    .map(
      (violation) =>
        violation.id +
        ": " +
        violation.nodes
          .slice(0, 3)
          .map((node) => node.target.join(" "))
          .join(", "),
    );
  expect.soft(violations, "accessibility").toEqual([]);
}

export async function capture(page: Page, name: string, options: CaptureOptions = {}) {
  const scope = await auditPage(page, options);
  await checkAccessibility(page, scope);
  const fullPage = scope === "body" && (options.fullPage ?? true);
  await expect(page).toHaveScreenshot(name + ".png", {
    fullPage,
    mask: (options.mask ?? []).map((selector) => page.locator(selector)),
    stylePath: fullPage ? fullPageStyle : undefined,
  });
}
