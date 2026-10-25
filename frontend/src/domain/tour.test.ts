import { describe, expect, it } from "vitest";
import { isLastStep, moveStep, resolveSteps, stepLabel, type TourStep } from "./tour";

const steps: TourStep[] = [
  { target: "new-work", title: "Новая работа", text: "" },
  { target: "queue", title: "Очередь", text: "" },
  { target: "students", title: "Ученики", text: "" },
  { target: "overview", title: "Обзор", text: "" },
  { target: "restart", title: "Заново", text: "" },
];

describe("tour", () => {
  it("skips a step whose target is not on the screen", () => {
    const shown = resolveSteps(steps, (target) => target !== "queue");
    expect(shown.map((step) => step.target)).toEqual([
      "new-work",
      "students",
      "overview",
      "restart",
    ]);
    expect(stepLabel(0, shown.length)).toBe("Шаг 1 из 4");
  });

  it("moves between steps without leaving the tour", () => {
    expect(moveStep(0, "back", 5)).toBe(0);
    expect(moveStep(0, "next", 5)).toBe(1);
    expect(moveStep(3, "next", 5)).toBe(4);
    expect(moveStep(4, "next", 5)).toBe(4);
    expect(moveStep(4, "back", 5)).toBe(3);
  });

  it("knows the last step", () => {
    expect(isLastStep(3, 5)).toBe(false);
    expect(isLastStep(4, 5)).toBe(true);
    expect(isLastStep(0, 1)).toBe(true);
  });
});
