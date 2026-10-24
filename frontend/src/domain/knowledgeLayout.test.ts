import { describe, expect, it } from "vitest";
import { topics as catalog } from "../data/catalog";
import { catalogTopics } from "./knowledgeFragment";
import { layoutKnowledgeMap, mapNode, wrapName } from "./knowledgeLayout";

const ids = ["fractions", "powers", "domain", "equations", "roots", "inequalities", "logs"];
const topics = catalogTopics(catalog, ids).map((topic) => ({
  ...topic,
  prerequisites: topic.prerequisites.filter((parent) => ids.includes(parent)),
}));
const layout = layoutKnowledgeMap(topics);
const overlaps = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.abs(a.x - b.x) < mapNode.width && Math.abs(a.y - b.y) < mapNode.height;

describe("knowledge map layout", () => {
  it("puts every prerequisite in a row above its dependent topic", () => {
    for (const topic of topics)
      for (const parent of topic.prerequisites)
        expect(layout.nodes[parent].y).toBeLessThan(layout.nodes[topic.id].y);
  });

  it("places topics without overlaps inside the canvas", () => {
    const nodes = Object.values(layout.nodes);
    nodes.forEach((a, index) =>
      nodes.slice(index + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
    );
    for (const node of nodes) {
      expect(node.x).toBeGreaterThanOrEqual(0);
      expect(node.x + mapNode.width).toBeLessThanOrEqual(layout.width);
      expect(node.y + mapNode.height).toBeLessThanOrEqual(layout.height);
    }
  });

  it("draws one edge per prerequisite and keeps crossings to the unavoidable minimum", () => {
    expect(layout.edges).toHaveLength(
      topics.reduce((sum, topic) => sum + topic.prerequisites.length, 0),
    );
    expect(layout.crossings).toBeLessThanOrEqual(2);
  });

  it("routes edges between rows instead of around the outside of the graph", () => {
    for (const edge of layout.edges) {
      const xs = [...edge.d.matchAll(/(-?[\d.]+),(-?[\d.]+)/g)].map((match) => Number(match[1]));
      expect(Math.min(...xs)).toBeGreaterThan(0);
      expect(Math.max(...xs)).toBeLessThan(layout.width);
    }
  });

  it("is computed from the data, so a new topic gets its own row", () => {
    const extended = layoutKnowledgeMap([
      ...topics,
      { id: "extra", name: "Новая тема", prerequisites: ["logs"] },
    ]);
    expect(extended.nodes.extra.y).toBeGreaterThan(extended.nodes.logs.y);
  });

  it("returns an empty canvas for a student without topics", () => {
    expect(layoutKnowledgeMap([])).toEqual({
      width: 0,
      height: 0,
      nodes: {},
      edges: [],
      crossings: 0,
    });
  });

  it("lays out the whole catalog without overlaps", () => {
    const whole = layoutKnowledgeMap(catalog);
    const nodes = Object.values(whole.nodes);
    expect(nodes).toHaveLength(catalog.length);
    nodes.forEach((a, index) =>
      nodes.slice(index + 1).forEach((b) => expect(overlaps(a, b)).toBe(false)),
    );
  });

  it("wraps long names into two lines", () => {
    expect(wrapName("Область допустимых значений")).toEqual(["Область допустимых", "значений"]);
    expect(wrapName("Дроби")).toEqual(["Дроби"]);
  });
});
