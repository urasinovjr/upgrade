export type TourTarget = "new-work" | "queue" | "students" | "overview" | "restart";

export interface TourStep {
  target: TourTarget;
  title: string;
  text: string;
}

export type TourMove = "next" | "back";

export function resolveSteps(steps: TourStep[], present: (target: TourTarget) => boolean) {
  return steps.filter((step) => present(step.target));
}

export function moveStep(index: number, move: TourMove, total: number) {
  if (move === "next") return Math.min(index + 1, total - 1);
  return Math.max(index - 1, 0);
}

export function isLastStep(index: number, total: number) {
  return index >= total - 1;
}

export function stepLabel(index: number, total: number) {
  return `Шаг ${index + 1} из ${total}`;
}
