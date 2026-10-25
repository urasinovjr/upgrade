import { useEffect, useRef, useState } from "react";
import { useMotionAllowed } from "./motionPreference";

const duration = 600;
const shown = new Map<string, number>();

export function countAt(from: number, to: number, progress: number) {
  const eased = 1 - (1 - Math.min(Math.max(progress, 0), 1)) ** 3;
  return Math.round(from + (to - from) * eased);
}

export function useCountUp(key: string, value: number) {
  const motionAllowed = useMotionAllowed();
  const origin = useRef(shown.get(key) ?? 0);
  const [animated, setAnimated] = useState<number | null>(() =>
    motionAllowed && shown.get(key) !== value ? (shown.get(key) ?? 0) : null,
  );

  useEffect(() => {
    if (!motionAllowed) return;
    const from = origin.current;
    shown.set(key, value);
    const start = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const progress = from === value ? 1 : (now - start) / duration;
      if (progress < 1) {
        setAnimated(countAt(from, value, progress));
        frame = requestAnimationFrame(tick);
        return;
      }
      origin.current = value;
      setAnimated(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [key, value, motionAllowed]);

  return animated ?? value;
}
