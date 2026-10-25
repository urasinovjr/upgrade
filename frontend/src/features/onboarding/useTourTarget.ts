import { useEffect, useState } from "react";
import type { TourTarget } from "../../domain/tour";
import type { Box } from "./placement";
import { findTarget } from "./tourSteps";

function boxOf(element: HTMLElement): Box {
  const rect = element.getBoundingClientRect();
  return { x: rect.left, y: rect.top, width: rect.width, height: rect.height };
}

function inView(box: Box) {
  return box.y >= 0 && box.y + box.height <= window.innerHeight;
}

export function useTourTarget(target: TourTarget | undefined, smooth: boolean) {
  const [box, setBox] = useState<Box | null>(null);

  useEffect(() => {
    const element = target ? findTarget(target) : null;
    if (!element) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => setBox(boxOf(element)));
    };
    if (!inView(boxOf(element))) {
      element.scrollIntoView({ block: "center", behavior: smooth ? "smooth" : "auto" });
    }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [target, smooth]);

  return box;
}
