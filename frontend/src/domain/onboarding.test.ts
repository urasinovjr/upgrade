import { describe, expect, it } from "vitest";
import {
  completedOnboarding,
  emptyOnboarding,
  hintSeen,
  normalizeOnboarding,
  shouldAutoStartTour,
  withHintSeen,
  withTourOutcome,
} from "./onboarding";

describe("onboarding", () => {
  it("starts with no tour outcome and no hints seen", () => {
    expect(emptyOnboarding()).toEqual({ version: 1, tour: null, hints: [] });
  });

  it("starts the tour only for a new account without confirmed works", () => {
    expect(shouldAutoStartTour(emptyOnboarding(), false)).toBe(true);
    expect(shouldAutoStartTour(emptyOnboarding(), true)).toBe(false);
    expect(shouldAutoStartTour(withTourOutcome(emptyOnboarding(), "skipped"), false)).toBe(false);
    expect(shouldAutoStartTour(withTourOutcome(emptyOnboarding(), "done"), false)).toBe(false);
  });

  it("remembers each hint once", () => {
    const once = withHintSeen(emptyOnboarding(), "review");
    const twice = withHintSeen(once, "review");
    expect(twice).toBe(once);
    expect(hintSeen(twice, "review")).toBe(true);
    expect(hintSeen(twice, "new-work")).toBe(false);
  });

  it("keeps the saved tour outcome and known hints", () => {
    const stored = { version: 1, tour: "skipped", hints: ["review", "review", "theme", 3] };
    expect(normalizeOnboarding(stored)).toEqual({ version: 1, tour: "skipped", hints: ["review"] });
  });

  it("starts over when the stored value is broken or from another version", () => {
    expect(normalizeOnboarding(null)).toEqual(emptyOnboarding());
    expect(normalizeOnboarding("done")).toEqual(emptyOnboarding());
    expect(normalizeOnboarding({ version: 2, tour: "done", hints: [] })).toEqual(emptyOnboarding());
    expect(normalizeOnboarding({ version: 1, tour: "maybe", hints: "review" })).toEqual(
      emptyOnboarding(),
    );
  });

  it("marks everything as seen for an account that knows the cabinet", () => {
    const done = completedOnboarding();
    expect(done.tour).toBe("done");
    expect(done.hints).toEqual(["review", "new-work", "knowledge-map"]);
    expect(normalizeOnboarding(done)).toEqual(done);
  });
});
