import { describe, expect, it } from "vitest";
import type { Task } from "./models";
import { mentions, namePlaceLabels, namePlaces } from "./nameGuard";

const cases: [string, string, boolean][] = [
  ["Иван Петров", "Ответ Ивану: x=2", true],
  ["Иван Петров", "Работа Иваном сдана", true],
  ["Мария Иванова", "Проверила Ивановой", true],
  ["Мария", "Задача Марии", true],
  ["Мария", "марка и маринад", false],
  ["Пётр", "петр решил", true],
  ["Петя", "петля функции", false],
  ["Аня", "Ани нет", false],
  ["Ян", "Ян решил", false],
  ["Иван", "\\text{Иван}: x^2=4", true],
  ["Иван", "Ивановский округ", false],
  ["", "Иван", false],
];

function task(id: string, changes: Partial<Task> = {}): Task {
  return {
    id,
    title: id,
    condition: "Решите уравнение",
    formula: "",
    reference: "",
    topicId: "equations",
    steps: [],
    feedback: "",
    reviewed: false,
    omitted: false,
    ...changes,
  };
}

describe("name guard", () => {
  it.each(cases)("finds %s in «%s»: %s", (name, text, expected) => {
    expect(mentions(name, text)).toBe(expected);
  });

  it("points to the task, field and step", () => {
    const tasks = [
      task("t1", { condition: "Иван, решите" }),
      task("t2", {
        steps: [
          { id: "a", latex: "x=1", verdict: "uncertain", explanation: "" },
          { id: "b", latex: "Ивану: x=2", verdict: "uncertain", explanation: "" },
        ],
      }),
    ];

    const places = namePlaces("Иван Сидоров", tasks);

    expect(places).toEqual([
      { taskId: "t1", field: "condition" },
      { taskId: "t2", field: "step", stepId: "b" },
    ]);
    expect(namePlaceLabels(places, tasks)).toEqual(["задача 1, условие", "задача 2, шаг решения"]);
  });
});
