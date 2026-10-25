import { type ReactNode, useEffect, useRef, useState } from "react";
import { useMotionValueEvent, useScroll, useSpring } from "motion/react";
import * as m from "motion/react-m";
import { JourneyFrame } from "./JourneyFrame";
import { isJumping, jumpEndEvent, jumpStartEvent } from "./anchorScroll";
import { isSettled, journeySteps, stageAt } from "./journeyStage";

const lineSpring = { stiffness: 140, damping: 26, mass: 0.6 };

export function JourneyScene({ head }: { head: ReactNode }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: trackRef, offset: ["start start", "end end"] });
  const line = useSpring(scrollYProgress, lineSpring);
  const [position, setPosition] = useState({ stage: 0, settled: false });

  function show(value: number) {
    const stage = stageAt(value);
    const settled = isSettled(value);
    setPosition((current) =>
      current.stage === stage && current.settled === settled ? current : { stage, settled },
    );
  }

  useMotionValueEvent(scrollYProgress, "change", (value) => {
    if (!isJumping()) show(value);
  });

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    const jumpTo = (to: number) => {
      const top = track.getBoundingClientRect().top + window.scrollY;
      const length = track.offsetHeight - window.innerHeight;
      track.dataset.instant = "true";
      show((to - top) / length);
      requestAnimationFrame(() => requestAnimationFrame(() => delete track.dataset.instant));
    };
    const onStart = (event: Event) => jumpTo((event as CustomEvent<{ to: number }>).detail.to);
    const onEnd = () => jumpTo(window.scrollY);
    window.addEventListener(jumpStartEvent, onStart);
    window.addEventListener(jumpEndEvent, onEnd);
    return () => {
      window.removeEventListener(jumpStartEvent, onStart);
      window.removeEventListener(jumpEndEvent, onEnd);
    };
  }, []);
  const { stage, settled } = position;
  return (
    <div ref={trackRef} className="dp-journey-track" data-step={stage + 1} data-pinned>
      <div className="dp-journey-sticky">
        <div className="dp-journey-text">
          {head}
          <ol className="dp-journey-steps">
            <m.span className="dp-journey-rail" style={{ scaleY: line }} aria-hidden="true" />
            {journeySteps.map((step, index) => (
              <li
                key={step.title}
                aria-current={index === stage ? "step" : undefined}
                data-done={index < stage}
              >
                <span className="dp-journey-index">{index + 1}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
        </div>
        <div className="dp-journey-stage">
          <p className="dp-journey-counter" aria-hidden="true">
            <span key={stage}>
              Шаг {stage + 1} из {journeySteps.length}
            </span>
          </p>
          <JourneyFrame stage={stage} settled={settled} />
        </div>
      </div>
    </div>
  );
}
