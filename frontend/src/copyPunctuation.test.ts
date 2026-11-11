import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname);
const educational = new Set([
  "Открытых пробелов нет.",
  "Подтверждённых пробелов пока нет.",
  "Решение посмотрим вместе на занятии.",
  "При x&nbsp;=&nbsp;3 знаменатель равен нулю. Добавьте условие x&nbsp;≠&nbsp;3.",
]);
const processes =
  /Загружа|Сохраня|Готов|Созда|Распозна|Отправля|Открыва|Проверя|Входим|Заверша|Удаля|Запуска|Восстанавлива/;

function filesIn(folder: string): string[] {
  return readdirSync(folder, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(folder, entry.name);
    return entry.isDirectory() ? filesIn(file) : /\.tsx?$/.test(file) ? [file] : [];
  });
}

function systemStrings(file: string): string[] {
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const values: string[] = [];
  const visit = (node: ts.Node) => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isJsxText(node) ||
      ts.isTemplateExpression(node)
    ) {
      const value = ts.isTemplateExpression(node)
        ? node.head.text + node.templateSpans.map((span) => "N" + span.literal.text).join("")
        : node.text;
      let skip = false;
      if (file.endsWith("/domain/review.ts")) {
        skip = node.getStart(source) > text.indexOf("export function reportText");
      }
      if (file.endsWith("/data/localHomework.ts") && ts.isPropertyAssignment(node.parent)) {
        skip = ["condition", "explanation", "answer", "solution"].includes(
          node.parent.name.getText(source),
        );
      }
      if (ts.isJsxText(node) && ts.isJsxElement(node.parent)) {
        const siblings = node.parent.children;
        skip = siblings.slice(siblings.indexOf(node) + 1).some((sibling) => {
          return !ts.isJsxText(sibling) || Boolean(sibling.text.trim());
        });
      }
      const continuation = ts.isStringLiteral(node) && /\.\s+$/.test(value);
      const dotAfterMarkup =
        ts.isJsxText(node) &&
        value.trim() === "." &&
        /[А-Яа-яЁё]/.test(node.parent.getText(source));
      if (!skip && (/[А-Яа-яЁё]/.test(value) || dotAfterMarkup) && !continuation) {
        values.push(value.trim().replace(/\s+/g, " "));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  return values.filter((value) => !educational.has(value));
}

const files = filesIn(root).filter(
  (file) =>
    !file.includes(".test.") &&
    !file.includes("/features/legal/") &&
    !/\/(fixtures|PencilDemo)\.tsx?$/.test(file),
);

describe("system copy punctuation", () => {
  it("page metadata follows the same punctuation rules", () => {
    const html = readFileSync(path.resolve(root, "../index.html"), "utf8");
    const descriptions = [...html.matchAll(/content="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((value) => /[А-Яа-яЁё]/.test(value));
    expect(descriptions.length).toBeGreaterThan(0);
    expect(descriptions.filter((value) => /[.!]$/.test(value))).toEqual([]);
  });

  it.each(files.map((file) => path.relative(root, file)))("%s follows UI punctuation", (file) => {
    const problems = systemStrings(path.join(root, file)).filter((value) => {
      const technical = /(?:стр|кл|т\. д|т\. п)\.$/.test(value) || /https?:\/\//.test(value);
      return (
        (!technical && /(?<!\.)\.$/.test(value)) ||
        value.includes("...") ||
        (value.includes("…") && !processes.test(value))
      );
    });
    expect(problems).toEqual([]);
  });
});
