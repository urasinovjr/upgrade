export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

export type Side = "right" | "bottom" | "left" | "top";

const gap = 16;
const margin = 16;
const sides: Side[] = ["right", "bottom", "left", "top"];

function clamp(value: number, low: number, high: number) {
  return Math.min(Math.max(value, low), Math.max(low, high));
}

function positionOn(side: Side, target: Box, card: Size) {
  if (side === "right") return { x: target.x + target.width + gap, y: target.y };
  if (side === "left") return { x: target.x - gap - card.width, y: target.y };
  if (side === "bottom") return { x: target.x, y: target.y + target.height + gap };
  return { x: target.x, y: target.y - gap - card.height };
}

function fits(position: { x: number; y: number }, card: Size, viewport: Size) {
  return (
    position.x >= margin &&
    position.y >= margin &&
    position.x + card.width <= viewport.width - margin &&
    position.y + card.height <= viewport.height - margin
  );
}

export function placeCard(target: Box, card: Size, viewport: Size) {
  const side =
    sides.find((candidate) => {
      const position = positionOn(candidate, target, card);
      const across =
        candidate === "right" || candidate === "left"
          ? { ...position, y: margin }
          : { ...position, x: margin };
      return fits(across, card, viewport);
    }) ?? "bottom";
  const position = positionOn(side, target, card);
  return {
    side,
    x: clamp(position.x, margin, viewport.width - margin - card.width),
    y: clamp(position.y, margin, viewport.height - margin - card.height),
  };
}

export function spotlight(target: Box, padding = 8): Box {
  return {
    x: target.x - padding,
    y: target.y - padding,
    width: target.width + padding * 2,
    height: target.height + padding * 2,
  };
}
