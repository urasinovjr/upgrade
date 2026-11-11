import { describe, expect, it } from "vitest";
import data from "./catalog.json";
import {
  familyIds,
  familyName,
  taskTypeById,
  taskTypes,
  topicById,
  topicLabel,
  topics,
  unknownTopicName,
} from "./catalog";

describe("topic catalog", () => {
  it("lists the families the type knows about", () => {
    expect(data.families.map((family) => family.id)).toEqual([...familyIds]);
    expect(familyName("trigonometry")).toBe("Тригонометрия");
  });
  it("names an unknown topic instead of failing", () => {
    expect(topicById("calculus")).toBeUndefined();
    expect(topicLabel("calculus")).toBe(unknownTopicName);
    expect(topicLabel("domain")).toBe("Область допустимых значений");
  });
  it("keeps the topics older drafts refer to", () => {
    for (const id of [
      "fractions",
      "powers",
      "domain",
      "equations",
      "roots",
      "inequalities",
      "logs",
    ])
      expect(topicById(id)?.id).toBe(id);
  });
  it("links every task type in scope to known topics", () => {
    for (const item of taskTypes.filter((entry) => entry.inScope))
      expect(item.topicIds.every((id) => topics.some((topic) => topic.id === id))).toBe(true);
    expect(taskTypeById("derivative")?.inScope).toBe(true);
  });
});
