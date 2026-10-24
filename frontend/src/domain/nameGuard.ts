import forms from "../data/nameForms.json";
import type { Student, Task } from "./models";

export interface NamePlace {
  taskId: string;
  field: "condition" | "formula" | "reference" | "step";
  stepId?: string;
}

interface NameForms {
  own: Set<string>;
  exact: Set<string>;
  cyrillicStems: Set<string>;
  latinStems: Set<string>;
}

const token = /\\\\|\\[a-z]+|[a-zа-яё]+/giu;
const cyrillic = /^[а-яё]+$/u;
const cyrillicEndings = "аеиоуыэюяйь";
const latinEndings = "aeiouy";
const cyrillicInflection = /^[аеиоуыэюяйьмвх]{0,3}$/u;
const latinInflection = /^[aeiouyjmvhk]{0,4}$/u;
const shortestStem = 3;
const shortCases: Record<string, string[]> = {
  а: ["ы", "е", "у", "ой"],
  я: ["и", "е", "ю", "ей"],
};
const mostVariants = 64;
const textFields = ["condition", "formula", "reference"] as const;
const stopWords = new Set(forms.stopWords);
const translit: Record<string, string[]> = forms.translit;
const groups = forms.groups.map((group) => group.map(normalized));

function normalized(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

function wordsOf(text: string): string[] {
  return (text.match(token) ?? []).filter((found) => !found.startsWith("\\"));
}

function groupForms(words: Set<string>): Set<string> {
  const result = new Set(words);
  for (const group of groups) {
    if (group.some((member) => words.has(member))) {
      for (const member of group) result.add(member);
    }
  }
  return result;
}

function latinVariants(word: string): string[] {
  let variants = [""];
  for (const letter of word) {
    const options = translit[letter] ?? [letter];
    variants = variants
      .flatMap((variant) => options.map((option) => variant + option))
      .slice(0, mostVariants);
  }
  return [...variants, ...variants.map((variant) => variant.replaceAll("ks", "x"))];
}

function stemOf(word: string, endings: string): string {
  return endings.includes(word.at(-1)!) && word.length > shortestStem ? word.slice(0, -1) : word;
}

function casesOf(form: string): string[] {
  if (form.length !== shortestStem) return [];
  return (shortCases[form.at(-1)!] ?? []).map((ending) => form.slice(0, -1) + ending);
}

function nameForms(names: string[]): NameForms {
  const words = new Set(names.flatMap(wordsOf).map(normalized));
  const exact = new Set<string>();
  const cyrillicStems = new Set<string>();
  const latinStems = new Set<string>();
  for (const form of groupForms(words)) {
    if (cyrillic.test(form) && form.length < shortestStem) {
      exact.add(form);
      continue;
    }
    if (cyrillic.test(form)) {
      for (const item of casesOf(form)) exact.add(item);
      cyrillicStems.add(stemOf(form, cyrillicEndings));
    }
    for (const variant of latinVariants(form)) {
      if (variant.length >= shortestStem) latinStems.add(stemOf(variant, latinEndings));
    }
  }
  return { own: words, exact, cyrillicStems, latinStems };
}

function hasStem(item: string, stems: Set<string>, inflection: RegExp): boolean {
  for (const stem of stems) {
    if (item.startsWith(stem) && inflection.test(item.slice(stem.length))) return true;
  }
  return false;
}

function isName(found: string, nameForms: NameForms): boolean {
  const item = normalized(found);
  if (nameForms.own.has(item)) return true;
  if (stopWords.has(found.toLowerCase())) return false;
  return (
    nameForms.exact.has(item) ||
    hasStem(item, nameForms.cyrillicStems, cyrillicInflection) ||
    hasStem(item, nameForms.latinStems, latinInflection)
  );
}

function foundIn(text: string, nameForms: NameForms): boolean {
  return wordsOf(text).some((found) => isName(found, nameForms));
}

export function studentNames(student?: Student): string[] {
  return student ? [student.name, ...(student.aliases ?? [])] : [];
}

export const mostAliases = 10;
export const longestAlias = 40;

export function parsedAliases(text: string): string[] {
  return text
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function aliasProblem(aliases: string[]): string {
  if (aliases.length > mostAliases) return `Укажите не больше ${mostAliases} форм имени.`;
  if (aliases.some((item) => item.length > longestAlias))
    return `Каждая форма имени — не длиннее ${longestAlias} символов.`;
  return "";
}

export function mentions(names: string[], text: string): boolean {
  return foundIn(text, nameForms(names));
}

export function namePlaces(names: string[], tasks: Task[]): NamePlace[] {
  const found = nameForms(names);
  const places: NamePlace[] = [];
  for (const task of tasks) {
    for (const field of textFields) {
      if (foundIn(task[field], found)) places.push({ taskId: task.id, field });
    }
    for (const step of task.steps) {
      if (foundIn(step.latex, found))
        places.push({ taskId: task.id, field: "step", stepId: step.id });
    }
  }
  return places;
}

const fieldLabels: Record<NamePlace["field"], string> = {
  condition: "условие",
  formula: "формула",
  reference: "правильный ответ",
  step: "шаг решения",
};

export function namePlaceLabels(places: NamePlace[], tasks: Task[]): string[] {
  const labels = places.map((place) => {
    const number = tasks.findIndex((task) => task.id === place.taskId) + 1;
    return `задача ${number}, ${fieldLabels[place.field]}`;
  });
  return [...new Set(labels)];
}

export const nameMessage =
  "Уберите имя ученика из текста задач. Условия, правильные ответы и шаги уходят ИИ без имени.";
