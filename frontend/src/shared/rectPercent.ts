import { useState } from "react";
import type { CropRect } from "../domain/models";

export type PercentValues = ReturnType<typeof percentValues>;

export function percentValues(rect: CropRect) {
  return {
    x: String(Math.round(rect.x * 100)),
    y: String(Math.round(rect.y * 100)),
    width: String(Math.round(rect.width * 100)),
    height: String(Math.round(rect.height * 100)),
  };
}

export function rectFromPercent(values: ReturnType<typeof percentValues>, minSize: number) {
  const x = Math.min(1 - minSize, Math.max(0, Number(values.x) / 100));
  const y = Math.min(1 - minSize, Math.max(0, Number(values.y) / 100));
  return {
    x,
    y,
    width: Math.min(1 - x, Math.max(minSize, Number(values.width) / 100)),
    height: Math.min(1 - y, Math.max(minSize, Number(values.height) / 100)),
  };
}

export function useRectFields(rect: CropRect) {
  return useState(() => percentValues(rect));
}
