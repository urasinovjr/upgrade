import type { Task } from "./models";

export interface NamePlace {
  taskId: string;
  field: "condition" | "formula" | "reference" | "step";
  stepId?: string;
}

const word = /[a-zа-яё]+/giu;
const endings = "аеиоуыэюяйь";
const inflection = /^[аеиоуыэюяйьмвх]{0,3}$/u;
const textFields = ["condition", "formula", "reference"] as const;

function normalized(text: string): string {
  return text.toLowerCase().replaceAll("ё", "е");
}

export function nameStems(name: string): string[] {
  const stems: string[] = [];
  for (const found of name.match(word) ?? []) {
    const item = normalized(found);
    if (item.length < 3) continue;
    const trimmed = endings.includes(item.at(-1)!) && item.length > 3;
    stems.push(trimmed ? item.slice(0, -1) : item);
  }
  return stems;
}

function isName(found: string, stems: string[]): boolean {
  const item = normalized(found);
  return stems.some((stem) => item.startsWith(stem) && inflection.test(item.slice(stem.length)));
}

export function mentions(name: string, text: string): boolean {
  const stems = nameStems(name);
  return (text.match(word) ?? []).some((found) => isName(found, stems));
}

export function namePlaces(name: string, tasks: Task[]): NamePlace[] {
  const places: NamePlace[] = [];
  for (const task of tasks) {
    for (const field of textFields) {
      if (mentions(name, task[field])) places.push({ taskId: task.id, field });
    }
    for (const step of task.steps) {
      if (mentions(name, step.latex))
        places.push({ taskId: task.id, field: "step", stepId: step.id });
    }
  }
  return places;
}

const fieldLabels: Record<NamePlace["field"], string> = {
  condition: "условие",
  formula: "формула",
  reference: "эталон",
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
  "Уберите имя ученика из текста задач: условия, эталоны и шаги уходят ИИ без имени.";
