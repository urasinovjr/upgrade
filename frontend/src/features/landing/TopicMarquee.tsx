import { type PointerEvent, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import {
  useAnimationFrame,
  useMotionTemplate,
  useMotionValue,
  useScroll,
  useSpring,
  useTransform,
  useVelocity,
} from "motion/react";
import * as m from "motion/react-m";
import { topics } from "../../data/catalog";
import { useMotionAllowed } from "../../shared/ui/motionPreference";
import { useInView } from "../../shared/ui/useInView";

const names = topics.map((topic) => topic.name);
const percentPerSecond = 0.35;

function wrap(offset: number) {
  return ((offset % 50) - 50) % 50;
}

function TopicList({ hidden = false }: { hidden?: boolean }) {
  return (
    <ul aria-hidden={hidden || undefined}>
      {names.map((name) => (
        <li key={name}>{name}</li>
      ))}
    </ul>
  );
}

export function TopicMarquee() {
  const motionAllowed = useMotionAllowed();
  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const ref = useRef<HTMLElement>(null);
  const inView = useInView(ref, { amount: 0, once: false });
  const direction = useRef(1);
  const offset = useMotionValue(0);
  const { scrollY } = useScroll();
  const velocity = useSpring(useVelocity(scrollY), { damping: 50, stiffness: 400 });
  const boost = useTransform(velocity, [-1000, 0, 1000], [-5, 0, 5], { clamp: false });
  const transform = useMotionTemplate`translateX(${offset}%)`;

  useAnimationFrame((_, delta) => {
    if (!motionAllowed || !inView || paused || held) return;
    const extra = boost.get();
    if (extra < -0.05) direction.current = -1;
    if (extra > 0.05) direction.current = 1;
    const step = percentPerSecond * (1 + Math.abs(extra)) * (delta / 1000);
    offset.set(wrap(offset.get() - step * direction.current));
  });

  function hover(event: PointerEvent<HTMLElement>, value: boolean) {
    if (event.pointerType === "mouse") setHeld(value);
  }

  return (
    <section
      ref={ref}
      className="dp-landing-marquee"
      aria-label="Темы, которые разбирает UpGrade"
      data-paused={paused}
      onPointerEnter={(event) => hover(event, true)}
      onPointerLeave={(event) => hover(event, false)}
    >
      <div className="dp-landing-marquee-viewport">
        <m.div
          className="dp-landing-marquee-track"
          style={motionAllowed ? { transform } : undefined}
        >
          <TopicList />
          <TopicList hidden />
        </m.div>
      </div>
      {motionAllowed && (
        <button
          type="button"
          className="dp-landing-marquee-toggle"
          aria-label="Остановить ленту"
          aria-pressed={paused}
          onClick={() => setPaused(!paused)}
        >
          {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        </button>
      )}
    </section>
  );
}
