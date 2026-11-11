import { describe, expect, it } from "vitest";
import { mixedTextParts } from "./mixedText";

const plain = (value: string) => ({ kind: "text", value });
const math = (value: string) => ({ kind: "math", value });

describe("mixed text", () => {
  it("keeps Russian spacing and line breaks around both math delimiters", () => {
    expect(mixedTextParts("Корни: $x=2$ и \\(x=-2\\).\nОтвет полный.")).toEqual([
      plain("Корни: "),
      math("x=2"),
      plain(" и "),
      math("x=-2"),
      plain(".\nОтвет полный."),
    ]);
  });
  it("separates legacy text commands from formulas", () => {
    expect(mixedTextParts("\\text{По теореме Пифагора }a^2+b^2=c^2")).toEqual([
      plain("По теореме Пифагора "),
      math("a^2+b^2=c^2"),
    ]);
  });
  it("keeps ordinary text and never consumes a following line", () => {
    expect(mixedTextParts("Ответ не завершён\nЕщё одна строка", false)).toEqual([
      plain("Ответ не завершён\nЕщё одна строка"),
    ]);
    expect(mixedTextParts("Тогда x = 2 и y = 3.")).toEqual([
      plain("Тогда"),
      plain(" "),
      math("x = 2"),
      plain(" "),
      plain("и"),
      plain(" "),
      math("y = 3."),
    ]);
  });
  it("preserves unmatched delimiters for manual correction", () => {
    expect(mixedTextParts("Проверьте $x=2", false)).toEqual([
      plain("Проверьте "),
      { kind: "invalid", value: "$x=2" },
    ]);
  });
});
