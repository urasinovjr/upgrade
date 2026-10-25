import { type RefObject, useEffect } from "react";
import { useFinePointer, useMotionAllowed } from "./motionPreference";

export function usePointerLight(
  area: RefObject<HTMLElement | null>,
  light: RefObject<HTMLElement | null>,
) {
  const finePointer = useFinePointer();
  const motionAllowed = useMotionAllowed();
  const enabled = finePointer && motionAllowed;

  useEffect(() => {
    const areaElement = area.current;
    const lightElement = light.current;
    if (!enabled || !areaElement || !lightElement) return;
    let frame = 0;
    let x = 0;
    let y = 0;

    const paint = () => {
      frame = 0;
      const half = lightElement.offsetWidth / 2;
      lightElement.style.transform = `translate3d(${x - half}px, ${y - half}px, 0)`;
    };
    const move = (event: PointerEvent) => {
      const box = areaElement.getBoundingClientRect();
      x = event.clientX - box.left;
      y = event.clientY - box.top;
      lightElement.dataset.on = "true";
      if (!frame) frame = requestAnimationFrame(paint);
    };
    const leave = () => {
      delete lightElement.dataset.on;
    };

    areaElement.addEventListener("pointermove", move);
    areaElement.addEventListener("pointerleave", leave);
    return () => {
      cancelAnimationFrame(frame);
      areaElement.removeEventListener("pointermove", move);
      areaElement.removeEventListener("pointerleave", leave);
      delete lightElement.dataset.on;
    };
  }, [area, light, enabled]);

  return enabled;
}
