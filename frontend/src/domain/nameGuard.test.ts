import { describe, expect, it } from "vitest";
import cases from "./nameGuardCases.json";
import type { Task } from "./models";
import {
  aliasProblem,
  mentions,
  namePlaceLabels,
  namePlaces,
  parsedAliases,
  studentNames,
} from "./nameGuard";

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
  it.each(cases)("finds $names in «$text»: $found", ({ names, text, found }) => {
    expect(mentions(names, text)).toBe(found);
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

    const places = namePlaces(["Иван Сидоров"], tasks);

    expect(places).toEqual([
      { taskId: "t1", field: "condition" },
      { taskId: "t2", field: "step", stepId: "b" },
    ]);
    expect(namePlaceLabels(places, tasks)).toEqual(["задача 1, условие", "задача 2, шаг решения"]);
  });

  it("reads other forms of the name from the card", () => {
    const aliases = parsedAliases(" Дашуня, , Dasha ");
    const student = { id: "s1", name: "Дарья", grade: 10, goal: "", color: "teal", aliases };

    expect(aliases).toEqual(["Дашуня", "Dasha"]);
    expect(studentNames(student)).toEqual(["Дарья", "Дашуня", "Dasha"]);
    expect(studentNames({ ...student, aliases: undefined })).toEqual(["Дарья"]);
    expect(studentNames()).toEqual([]);
    expect(mentions(studentNames(student), "Дашуне 5")).toBe(true);
  });

  it("limits the number and length of other forms", () => {
    expect(aliasProblem(["Даша"])).toBe("");
    expect(aliasProblem(Array.from({ length: 11 }, (_, index) => "Имя" + index))).toContain("10");
    expect(aliasProblem(["я".repeat(41)])).toContain("40");
  });
});
