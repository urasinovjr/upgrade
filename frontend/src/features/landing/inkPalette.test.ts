import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { honestGlow, inkDensity, parseColor } from "./inkPalette";

const styles = path.resolve(import.meta.dirname, "../../ui/styles/tokens.css");
const landingStyles = path.resolve(import.meta.dirname, "landing.css");
const tokens = readFileSync(styles, "utf8");

type Color = [number, number, number];

function token(name: string): Color {
  const match = tokens.match(new RegExp(`--ug-${name}:\\s*(#[0-9a-f]{6});`, "i"));
  if (!match) throw new Error(`no token ${name}`);
  return parseColor(match[1]);
}

function mix(base: Color, top: Color, alpha: number): Color {
  return [0, 1, 2].map((index) => base[index] * (1 - alpha) + top[index] * alpha) as Color;
}

function luminance(color: Color) {
  const [red, green, blue] = color.map((channel) =>
    channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first: Color, second: Color) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

describe("ink palette", () => {
  it("keeps the ink under the text lighter than at its peak", () => {
    expect(inkDensity.underText).toBeLessThan(inkDensity.peak);
    expect(inkDensity.peak).toBeLessThanOrEqual(0.22);
  });

  it.each(["muted", "text", "ink"])("keeps %s text readable over the densest ink", (name) => {
    const paper = mix(token("surface"), token("action"), inkDensity.underText);
    expect(contrast(token(name), paper)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(["on-action", "on-action-soft"])(
    "keeps %s text readable where both lights meet in the dark section",
    (name) => {
      const together = 1 - (1 - honestGlow.drift) * (1 - honestGlow.pointer);
      const lit = mix(token("action"), parseColor(honestGlow.color), together);
      expect(contrast(token(name), lit)).toBeGreaterThanOrEqual(4.5);
    },
  );

  it("uses the same glow colour as the styles", () => {
    const css = readFileSync(landingStyles, "utf8");
    const [red, green, blue] = parseColor(honestGlow.color).map((channel) =>
      Math.round(channel * 255),
    );
    const percent = (alpha: number) => `${Math.round(alpha * 100)}%`;
    expect(css).toContain(`rgb(${red} ${green} ${blue} / ${percent(honestGlow.pointer)})`);
    expect(css).toContain(`rgb(${red} ${green} ${blue} / ${percent(honestGlow.drift)})`);
  });

  it("reads a colour token with spaces around it", () => {
    expect(parseColor(" #26348c ")).toEqual([38 / 255, 52 / 255, 140 / 255]);
  });
});
