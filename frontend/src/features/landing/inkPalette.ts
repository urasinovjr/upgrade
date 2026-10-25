export const inkDensity = {
  peak: 0.22,
  underText: 0.08,
};

export const honestGlow = {
  color: "#788cff",
  drift: 0.1,
  pointer: 0.18,
};

export function parseColor(hex: string): [number, number, number] {
  const value = hex.trim().replace("#", "");
  const red = parseInt(value.slice(0, 2), 16) / 255;
  const green = parseInt(value.slice(2, 4), 16) / 255;
  const blue = parseInt(value.slice(4, 6), 16) / 255;
  return [red, green, blue];
}
