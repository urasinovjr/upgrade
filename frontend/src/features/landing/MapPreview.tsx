import { useRef, useState } from "react";
import { CircleCheck } from "lucide-react";
import { AnimatePresence } from "motion/react";
import * as m from "motion/react-m";
import { topics } from "../../data/catalog";
import { MapLinks } from "./MapLinks";
import { useAutoplay } from "./useAutoplay";

type PreviewState = "gap" | "path" | "closed" | "none";

const states: Record<string, PreviewState> = {
  fractions: "path",
  powers: "path",
  domain: "gap",
  equations: "closed",
};

const columns = [
  { title: "Основа", ids: ["fractions", "powers"] },
  { title: "Ограничения и уравнения", ids: ["domain", "equations"] },
  { title: "Дальше по программе", ids: ["roots", "inequalities", "logs"] },
];

const tour = ["fractions", "powers", "domain"];
const tourDurations = [1900, 1900, 3600];
const focusSpring = { type: "spring", duration: 0.5, bounce: 0.15 } as const;
const textEase = [0.23, 1, 0.32, 1] as const;

const legend: { state: PreviewState; label: string }[] = [
  { state: "gap", label: "Пробел" },
  { state: "path", label: "Ведёт к пробелу" },
  { state: "closed", label: "Пробел закрыт" },
  { state: "none", label: "Нет данных" },
];

export function MapPreview() {
  const [selected, setSelected] = useState("domain");
  const [hovered, setHovered] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const autoplay = useAutoplay(ref, tourDurations, (frame) => setSelected(tour[frame]));
  const current = autoplay.playing ? tour[autoplay.frame] : selected;
  const topic = topics.find((item) => item.id === current);
  return (
    <div ref={ref} className="dp-landing-map">
      <div className="dp-landing-map-side">
        <p className="dp-landing-map-student">
          <span className="dp-landing-avatar" aria-hidden="true">
            АС
          </span>
          Анна Соколова, 10 класс
        </p>
        <ul className="dp-landing-legend">
          {legend.map((item) => (
            <li key={item.state}>
              <span className={"dp-landing-node-sample is-" + item.state} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        {topic && (
          <div className="dp-landing-map-detail" aria-live={autoplay.playing ? "off" : "polite"}>
            <AnimatePresence mode="popLayout" initial={false}>
              <m.div
                key={topic.id}
                className="dp-landing-map-text"
                initial={{ opacity: 0, y: 6, filter: "blur(2px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, filter: "blur(2px)", transition: { duration: 0.16 } }}
                transition={{ duration: 0.26, ease: textEase }}
              >
                <strong>{topic.name}</strong>
                <span>{topic.description}</span>
              </m.div>
            </AnimatePresence>
          </div>
        )}
      </div>
      <div className="dp-landing-map-columns">
        <MapLinks active={hovered ?? current} />
        {columns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            {column.ids.map((id) => {
              const item = topics.find((entry) => entry.id === id);
              if (!item) return null;
              const state = states[id] ?? "none";
              return (
                <button
                  key={id}
                  type="button"
                  className={"dp-landing-node is-" + state}
                  data-node={id}
                  aria-pressed={current === id}
                  onClick={() => setSelected(id)}
                  onPointerEnter={() => setHovered(id)}
                  onPointerLeave={() => setHovered(null)}
                >
                  {current === id && (
                    <m.span
                      layoutId="dp-map-focus"
                      className="dp-landing-node-focus"
                      style={{ borderRadius: 18 }}
                      transition={focusSpring}
                    />
                  )}
                  {state === "closed" && <CircleCheck size={15} aria-hidden="true" />}
                  {item.name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
