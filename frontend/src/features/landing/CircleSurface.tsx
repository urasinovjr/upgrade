import { type PointerEvent, type ReactNode, useRef, useState } from "react";
import { isCircled, type Point, strokePath } from "./circleGesture";

type StrokeState = "idle" | "drawing" | "kept" | "fading";

interface CircleSurfaceProps {
  kept: boolean;
  onCircle: () => void;
  children: ReactNode;
}

export function CircleSurface({ kept, onCircle, children }: CircleSurfaceProps) {
  const pathRef = useRef<SVGPathElement>(null);
  const points = useRef<Point[]>([]);
  const [state, setState] = useState<StrokeState>("idle");
  const shownState = state === "kept" && !kept ? "fading" : state;

  function pointAt(box: DOMRect, event: { clientX: number; clientY: number }) {
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  function draw() {
    pathRef.current?.setAttribute("d", strokePath(points.current));
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    points.current = [pointAt(event.currentTarget.getBoundingClientRect(), event)];
    draw();
    setState("drawing");
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    if (state !== "drawing") return;
    const box = event.currentTarget.getBoundingClientRect();
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length > 0 ? samples : [event]) {
      points.current.push(pointAt(box, sample));
    }
    draw();
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    if (state !== "drawing") return;
    const surface = event.currentTarget.getBoundingClientRect();
    const targetElement = event.currentTarget.querySelector("[data-circle-target]");
    const target = targetElement?.getBoundingClientRect() ?? surface;
    const box = {
      x: target.left - surface.left,
      y: target.top - surface.top,
      width: target.width,
      height: target.height,
    };
    if (isCircled(points.current, box)) {
      setState("kept");
      onCircle();
    } else {
      setState("fading");
    }
  }

  return (
    <div
      className="dp-landing-circle-surface"
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={finish}
      onPointerCancel={() => setState("fading")}
    >
      {children}
      <svg className="dp-landing-hand-stroke" aria-hidden="true">
        <path
          ref={pathRef}
          data-state={shownState}
          onTransitionEnd={() => {
            if (shownState === "fading") setState("idle");
          }}
        />
      </svg>
    </div>
  );
}
