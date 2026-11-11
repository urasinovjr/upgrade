import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const backend = path.resolve(root, "../backend");
const extensions = [".ts", ".tsx"];
const extraFiles = [
  path.join(root, "index.html"),
  path.join(backend, "app/mail/templates.py"),
  path.join(backend, "app/works/review.py"),
  path.join(backend, "app/analysis/quality.py"),
  path.join(backend, "provider_sim/sim.py"),
];

const retiredTerms: [string, RegExp][] = [
  ["«редакция» вместо «версия»", /редакци/i],
  ["«эталон» вместо «правильный ответ»", /эталон/i],
  ["латинская «v» вместо «версия»", /· v\d|\bv\{|\bv\$\{/],
  ["«карта тем» вместо «карта знаний»", /карт[аеуы] тем\b/i],
  ["«темы для повторения» вместо «пробелы»", /тем[аы]? для повторения/i],
  ["«план повторения»", /план повторения/i],
  ["«Ошибка обработки» вместо «Разбор не удался»", /Ошибка обработки/],
  ["«Есть ошибка» вместо «Ошибка»", /Есть ошибка/],
  ["«Разбор для ученика» вместо «Отчёт по работе»", /Разбор для ученика/],
  ["«Проверка решения» вместо «Разбор работы»", /Проверка решения/],
  ["«Повторить разбор» вместо «Запустить разбор заново»", /Повторить разбор/],
  ["«рабочее пространство» вместо «кабинет»", /рабочее пространство/i],
  ["«виджет» вместо «блок»", /виджет/i],
  ["«преподаватель» вместо «репетитор»", /преподавател/i],
  ["пустые слова", /успешно|к сожалению|произошла ошибка/i],
  ["«подтвердить работу» вместо публикации", /подтвердить работу|работу не подтвердить/i],
  ["прежний статус публикации", /Подтверждена|Подтверждены|версия \d+ подтверждена/],
  ["прежнее название отработки", /Материал сохранён|Сохранить материал|Материалы для отработки/],
  ["прежнее название отзыва", /Отозвать подтверждение/],
  ["пробел до подтверждения гипотезы", /Подтвердить пробел|Добавить пробел/],
];

function listFiles(folder: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(folder)) {
    const fullPath = path.join(folder, name);
    if (statSync(fullPath).isDirectory()) files.push(...listFiles(fullPath));
    else if (extensions.includes(path.extname(name)) && !name.includes(".test.")) {
      files.push(fullPath);
    }
  }
  return files;
}

const files = [...listFiles(path.join(root, "src")), ...extraFiles];

describe("copy glossary", () => {
  it.each(files.map((file) => path.relative(root, file)))("%s uses current terms", (file) => {
    const text = readFileSync(path.join(root, file), "utf8");
    const found = retiredTerms
      .filter(([, pattern]) => pattern.test(text))
      .map(([reason]) => reason);
    expect(found).toEqual([]);
  });
});
