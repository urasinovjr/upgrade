import { describe, expect, it } from "vitest";
import cases from "./nameGuardCases.json";
import type { Task } from "./models";
import { mentions, namePlaceLabels, namePlaces } from "./nameGuard";

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
});
