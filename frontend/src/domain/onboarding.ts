export type HintId = "review" | "new-work" | "knowledge-map";
export type TourOutcome = "done" | "skipped";

export interface Onboarding {
  version: 1;
  tour: TourOutcome | null;
  hints: HintId[];
}

export const hintIds: HintId[] = ["review", "new-work", "knowledge-map"];

const isHintId = (value: unknown): value is HintId =>
  typeof value === "string" && hintIds.includes(value as HintId);

export function emptyOnboarding(): Onboarding {
  return { version: 1, tour: null, hints: [] };
}

export function completedOnboarding(): Onboarding {
  return { version: 1, tour: "done", hints: [...hintIds] };
}

export function normalizeOnboarding(value: unknown): Onboarding {
  if (typeof value !== "object" || value === null) return emptyOnboarding();
  const stored = value as { version?: unknown; tour?: unknown; hints?: unknown };
  if (stored.version !== 1) return emptyOnboarding();
  const tour = stored.tour === "done" || stored.tour === "skipped" ? stored.tour : null;
  const hints = Array.isArray(stored.hints) ? stored.hints.filter(isHintId) : [];
  return { version: 1, tour, hints: [...new Set(hints)] };
}

export function shouldAutoStartTour(onboarding: Onboarding, hasConfirmedWorks: boolean) {
  return onboarding.tour === null && !hasConfirmedWorks;
}

export function withTourOutcome(onboarding: Onboarding, outcome: TourOutcome): Onboarding {
  return { ...onboarding, tour: outcome };
}

export function hintSeen(onboarding: Onboarding, hint: HintId) {
  return onboarding.hints.includes(hint);
}

export function withHintSeen(onboarding: Onboarding, hint: HintId): Onboarding {
  if (hintSeen(onboarding, hint)) return onboarding;
  return { ...onboarding, hints: [...onboarding.hints, hint] };
}
