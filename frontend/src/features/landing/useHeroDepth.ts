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
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, spring);
  const smoothY = useSpring(pointerY, spring);
  const { scrollYProgress } = useScroll({ target: hero, offset: ["start start", "end start"] });

  const pointerTiltX = useTransform(smoothY, [-0.5, 0.5], [5, -5]);
  const scrollTiltX = useTransform(scrollYProgress, [0, 1], [0, 10]);
  const sheetRotateX = useTransform(() => pointerTiltX.get() + scrollTiltX.get());
  const sheetRotateY = useTransform(smoothX, [-0.5, 0.5], [-6, 6]);
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
    pointerY.set((event.clientY - box.top) / box.height - 0.5);
  }

  function onPointerLeave() {
    pointerX.set(0);
    pointerY.set(0);
  }

  if (!scroll) return { onPointerMove, onPointerLeave };
  const lift = { y: sheetY, scale: sheetScale, transformPerspective: 1000 };
  if (!pointer) {
    return {
      onPointerMove,
      onPointerLeave,
      sheet: { ...lift, rotateX: scrollTiltX },
      verdict: { y: verdictY },
      arrow: { opacity: arrowOpacity },
    };
  }
  return {
    onPointerMove,
    onPointerLeave,
    sheet: { ...lift, rotateX: sheetRotateX, rotateY: sheetRotateY },
    verdict: { x: verdictX, y: verdictY },
    arrow: { x: arrowX, opacity: arrowOpacity },
  };
}
