import { type PointerEvent, type RefObject } from "react";
import { useMotionValue, useScroll, useSpring, useTransform } from "motion/react";

const spring = { stiffness: 120, damping: 18, mass: 0.6 };

interface DepthOptions {
  pointer: boolean;
  scroll: boolean;
}

export function useHeroDepth(
  hero: RefObject<HTMLElement | null>,
  { pointer, scroll }: DepthOptions,
) {
  const pointerX = useMotionValue(0);
  const smoothX = useSpring(pointerX, spring);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });

  const pointerRotate = useTransform(smoothX, [-0.5, 0.5], [-1.5, 1.5]);
  const scrollRotate = useTransform(scrollYProgress, [0, 1], [0, 2]);
  const sheetRotate = useTransform(() => pointerRotate.get() + scrollRotate.get());
  const sheetY = useTransform(scrollYProgress, [0, 1], [0, 80]);
  const sheetScale = useTransform(scrollYProgress, [0, 1], [1, 0.94]);
  const verdictX = useTransform(smoothX, [-0.5, 0.5], [-12, 12]);
  const verdictY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const arrowX = useTransform(smoothX, [-0.5, 0.5], [6, -6]);
  const arrowOpacity = useTransform(scrollYProgress, [0, 1], [1, 0.4]);

  function onPointerMove(event: PointerEvent<HTMLElement>) {
    if (!pointer) return;
    const box = event.currentTarget.getBoundingClientRect();
    pointerX.set((event.clientX - box.left) / box.width - 0.5);
  }

  function onPointerLeave() {
    pointerX.set(0);
  }

  if (!scroll) return { onPointerMove, onPointerLeave };
  const lift = { y: sheetY, scale: sheetScale };
  if (!pointer) {
    return {
      onPointerMove,
      onPointerLeave,
      sheet: { ...lift, rotate: scrollRotate },
      verdict: { y: verdictY },
      arrow: { opacity: arrowOpacity },
    };
  }
  return {
    onPointerMove,
    onPointerLeave,
    sheet: { ...lift, rotate: sheetRotate },
    verdict: { x: verdictX, y: verdictY },
    arrow: { x: arrowX, opacity: arrowOpacity },
  };
}
