import { describe, expect, it } from "vitest";
import { topics } from "../data/catalog";
import { seedState } from "../data/fixtures";
import { gradeTitle, knowledgeFragment, studentTopicIds } from "./knowledgeFragment";

describe("knowledge map fragment", () => {
  it("collects topics from confirmed work, confirmed gaps and closures", () => {
    const state = seedState();
    expect([...studentTopicIds(state, "anna")].sort()).toEqual(["domain", "equations"]);
    state.closures.push({
      studentId: "anna",
      topicId: "logs",
      note: "",
      at: new Date().toISOString(),
      action: "reopen",
    });
    expect(studentTopicIds(state, "anna").has("logs")).toBe(true);
    expect(studentTopicIds(state, "ivan").size).toBe(0);
  });
  it("adds direct prerequisites and keeps the catalog order", () => {
    const fragment = knowledgeFragment(topics, ["domain"]).map((topic) => topic.id);
    expect(fragment).toEqual(["fractions", "powers", "sqrt_arithmetic", "domain"]);
    expect(knowledgeFragment(topics, ["calculus"])).toEqual([]);
  });
  it("titles a map row by the grades of its topics", () => {
    expect(gradeTitle([7, 8, 8])).toBe("7–8 класс");
    expect(gradeTitle([10])).toBe("10 класс");
    expect(gradeTitle([])).toBe("Темы");
  });
});
