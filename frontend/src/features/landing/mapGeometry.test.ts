import { describe, expect, it } from "vitest";
import { linkPath, mapLinks, touches } from "./mapGeometry";

describe("map links", () => {
  it("bends a curve from the right edge of one topic to the left edge of the next", () => {
    const from = { x: 0, y: 10, width: 100, height: 40 };
    const to = { x: 140, y: 90, width: 100, height: 20 };
    expect(linkPath(from, to)).toBe("M100 30 C120 30 120 100 140 100");
  });

  it("marks only the links that start or end at a topic", () => {
    const active = mapLinks.filter((link) => touches(link, "domain"));
    expect(active).toHaveLength(4);
    expect(mapLinks.filter((link) => touches(link, "fractions"))).toEqual([
      { from: "fractions", to: "domain" },
    ]);
    expect(mapLinks.filter((link) => touches(link, null))).toEqual([]);
  });
});
