import { type RefObject, useEffect, useRef, useState } from "react";
import { useFinePointer, useMotionAllowed } from "../../shared/ui/motionPreference";
import { createGovernor, renderScale } from "./inkWaterBudget";
import type { InkWater as Water } from "./inkWaterRenderer";
import { canUseWebGL } from "./webgl";

type InkState = "loading" | "running" | "paused" | "off";

interface InkWaterProps {
  area: RefObject<HTMLElement | null>;
  text: RefObject<HTMLElement | null>;
}

const seedDrops = [
  { x: 0.72, y: 0.36, delay: 0.2, strength: 1 },
  { x: 0.6, y: 0.72, delay: 0.9, strength: 0.8 },
  { x: 0.9, y: 0.6, delay: 1.6, strength: 0.7 },
];
const ambientEvery = 4.5;
const dropDistance = 90;
const dropPause = 0.35;

function whenIdle(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(callback, { timeout: 2500 });
    return () => window.cancelIdleCallback(id);
  }
  const id = setTimeout(callback, 800);
  return () => clearTimeout(id);
}

export function InkWater({ area, text }: InkWaterProps) {
  const motionAllowed = useMotionAllowed();
  const finePointer = useFinePointer();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [state, setState] = useState<InkState>("loading");

  useEffect(() => {
    const canvas = canvasRef.current;
    const hero = area.current;
    if (!motionAllowed || !canvas || !hero) return;
    let water: Water | null = null;
    let frame = 0;
    let stopped = false;
    let visible = document.visibilityState === "visible";
    let onScreen = true;
    let nextAmbient = ambientEvery;
    let lastDrop = { x: -1000, y: -1000, time: -10 };
    const governor = createGovernor();
    const startTime = performance.now();
    const seconds = () => (performance.now() - startTime) / 1000;

    const measure = () => {
      if (!water) return;
      const box = hero.getBoundingClientRect();
      water.resize(box.width, box.height, renderScale(window.devicePixelRatio, !finePointer));
      const textBox = text.current?.getBoundingClientRect();
      if (!textBox) return;
      water.setTextBox({
        x: textBox.left - box.left,
        y: textBox.top - box.top,
        width: textBox.width,
        height: textBox.height,
      });
    };

    const turnOff = () => {
      stopped = true;
      cancelAnimationFrame(frame);
      frame = 0;
      canvas.removeEventListener("webglcontextlost", onLost);
      water?.destroy();
      water = null;
      setState("off");
    };

    const loop = () => {
      frame = 0;
      if (!water) return;
      const now = seconds();
      if (now > nextAmbient) {
        const box = hero.getBoundingClientRect();
        const x = box.width * (0.5 + Math.random() * 0.45);
        const y = box.height * (0.15 + Math.random() * 0.75);
        water.addDrop(x, y, now, 0.6);
        nextAmbient = now + ambientEvery;
      }
      water.render(now);
      if (!governor.tick(performance.now())) {
        turnOff();
        return;
      }
      frame = requestAnimationFrame(loop);
    };

    const update = () => {
      if (!water || stopped) return;
      const running = visible && onScreen;
      setState(running ? "running" : "paused");
      if (running && !frame) {
        governor.reset();
        frame = requestAnimationFrame(loop);
      }
      if (!running && frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    function onLost(event: Event) {
      event.preventDefault();
      turnOff();
    }

    const onVisibility = () => {
      visible = document.visibilityState === "visible";
      update();
    };

    const onPointer = (event: PointerEvent) => {
      if (!water) return;
      if (event.type === "pointermove" && event.pointerType !== "mouse") return;
      const box = hero.getBoundingClientRect();
      const x = event.clientX - box.left;
      const y = event.clientY - box.top;
      const now = seconds();
      const moved = Math.hypot(x - lastDrop.x, y - lastDrop.y);
      if (moved < dropDistance || now - lastDrop.time < dropPause) return;
      water.addDrop(x, y, now, 0.9);
      lastDrop = { x, y, time: now };
    };

    const screenObserver = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      update();
    });
    const sizeObserver = new ResizeObserver(measure);

    const start = async () => {
      if (!canUseWebGL()) {
        stopped = true;
        setState("off");
        return;
      }
      const { createInkWater } = await import("./inkWaterRenderer");
      if (stopped) return;
      const ink = getComputedStyle(hero).getPropertyValue("--ug-action");
      water = createInkWater(canvas, ink);
      measure();
      const box = hero.getBoundingClientRect();
      const now = seconds();
      for (const drop of seedDrops) {
        water.addDrop(box.width * drop.x, box.height * drop.y, now + drop.delay, drop.strength);
      }
      nextAmbient = now + ambientEvery;
      canvas.addEventListener("webglcontextlost", onLost);
      screenObserver.observe(hero);
      sizeObserver.observe(hero);
      document.addEventListener("visibilitychange", onVisibility);
      hero.addEventListener("pointermove", onPointer);
      hero.addEventListener("pointerdown", onPointer);
      update();
    };

    const cancelIdle = whenIdle(() => void start());
    return () => {
      stopped = true;
      cancelIdle();
      cancelAnimationFrame(frame);
      screenObserver.disconnect();
      sizeObserver.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      hero.removeEventListener("pointermove", onPointer);
      hero.removeEventListener("pointerdown", onPointer);
      canvas.removeEventListener("webglcontextlost", onLost);
      water?.destroy();
    };
  }, [area, text, motionAllowed, finePointer]);

  if (!motionAllowed) return null;
  return <canvas ref={canvasRef} className="dp-landing-ink" data-ink={state} aria-hidden="true" />;
}
