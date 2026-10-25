import { describe, expect, it } from "vitest";
import { coverage, isCircled, strokePath, sweptAngle, type Point } from "./circleGesture";

const box = { x: 40, y: 20, width: 80, height: 30 };

function ellipse(centerX: number, centerY: number, radiusX: number, radiusY: number, turn = 1) {
  const points: Point[] = [];
  for (let index = 0; index <= 40; index += 1) {
    const angle = (index / 40) * Math.PI * 2 * turn;
    points.push({ x: centerX + Math.cos(angle) * radiusX, y: centerY + Math.sin(angle) * radiusY });
  }
  return points;
}

describe("circle gesture", () => {
  it("accepts a loop drawn around the formula", () => {
    expect(isCircled(ellipse(80, 35, 60, 28), box)).toBe(true);
  });

  it("accepts a loop that ends a little short of its start", () => {
    expect(isCircled(ellipse(80, 35, 60, 28, 0.85), box)).toBe(true);
  });

  it("rejects a straight line across the formula", () => {
    const line = Array.from({ length: 20 }, (_, index) => ({ x: 30 + index * 5, y: 35 }));
    expect(isCircled(line, box)).toBe(false);
  });

  it("rejects a small loop beside the formula", () => {
    expect(isCircled(ellipse(200, 35, 20, 12), box)).toBe(false);
  });

  it("rejects a half circle", () => {
    expect(isCircled(ellipse(80, 35, 60, 28, 0.5), box)).toBe(false);
  });

  it("rejects a stroke with too few points", () => {
    expect(isCircled(ellipse(80, 35, 60, 28).slice(0, 5), box)).toBe(false);
  });

  it("measures the turn around a point and the covered share of a box", () => {
    expect(sweptAngle(ellipse(80, 35, 60, 28), { x: 80, y: 35 })).toBeCloseTo(Math.PI * 2);
    expect(coverage(ellipse(80, 35, 20, 15), box)).toBeCloseTo((40 * 30) / (80 * 30));
  });

  it("builds a smooth path through the points", () => {
    expect(strokePath([])).toBe("");
    expect(
      strokePath([
        { x: 0, y: 0 },
        { x: 10, y: 0 },
        { x: 20, y: 10 },
      ]),
    ).toBe("M0.0 0.0 Q10.0 0.0 15.0 5.0 Q20.0 10.0 20.0 10.0");
  });
});
