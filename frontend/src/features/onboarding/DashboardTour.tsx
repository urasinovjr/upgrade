import { type KeyboardEvent, useCallback, useEffect, useId, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as m from "motion/react-m";
import type { TourOutcome } from "../../domain/onboarding";
import { isLastStep, moveStep, resolveSteps, stepLabel, type TourMove } from "../../domain/tour";
import { InkStroke } from "../../shared/ui/InkStroke";
import { MotionScope } from "../../shared/ui/MotionScope";
import { useMotionAllowed } from "../../shared/ui/motionPreference";
import { placeCard, spotlight, type Size } from "./placement";
import { findTarget, tourSteps } from "./tourSteps";
import { useTourTarget } from "./useTourTarget";
import "@fontsource/caveat/600.css";
import "./onboarding.css";

const spring = { type: "spring", duration: 0.5, bounce: 0.15 } as const;
const instant = { duration: 0 } as const;
const underline = "M2 8c40-5 90-6 150-3";

function useViewport() {
  const [size, setSize] = useState<Size>({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const resize = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  return size;
}

function Underline() {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <svg className="dp-tour-underline" viewBox="0 0 156 12" aria-hidden="true">
      <InkStroke d={underline} drawn={drawn} tone="ink" delay={150} />
    </svg>
  );
}

function TourCard({ onFinish }: { onFinish: (outcome: TourOutcome) => void }) {
  const motionAllowed = useMotionAllowed();
  const maskId = useId();
  const [steps] = useState(() => resolveSteps(tourSteps, (target) => findTarget(target) !== null));
  const [index, setIndex] = useState(0);
  const step = steps[index];
  const box = useTourTarget(step?.target, motionAllowed);
  const viewport = useViewport();
  const [card, setCard] = useState<Size>({ width: 340, height: 220 });
  const transition = motionAllowed ? spring : instant;

  const observeCard = useCallback((element: HTMLDivElement | null) => {
    if (!element) return;
    const observer = new ResizeObserver(() =>
      setCard({ width: element.offsetWidth, height: element.offsetHeight }),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  if (!step || !box) return null;
  const last = isLastStep(index, steps.length);
  const hole = spotlight(box);
  const place = placeCard(hole, card, viewport);
  const move = (direction: TourMove) =>
    setIndex((current) => moveStep(current, direction, steps.length));

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === "ArrowRight" && !last) move("next");
    if (event.key === "ArrowLeft") move("back");
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onFinish("skipped")}>
      <Dialog.Portal>
        <svg className="dp-tour-shade" aria-hidden="true">
          <defs>
            <mask id={maskId}>
              <rect width="100%" height="100%" fill="white" />
              <m.rect
                rx={14}
                fill="black"
                initial={false}
                animate={{ attrX: hole.x, attrY: hole.y, width: hole.width, height: hole.height }}
                transition={transition}
              />
            </mask>
          </defs>
          <rect className="dp-tour-dim" width="100%" height="100%" mask={`url(#${maskId})`} />
          <m.rect
            className="dp-tour-ring"
            rx={14}
            initial={false}
            animate={{ attrX: hole.x, attrY: hole.y, width: hole.width, height: hole.height }}
            transition={transition}
          />
        </svg>
        <Dialog.Content
          asChild
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement).focus();
          }}
          onPointerDownOutside={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onKeyDown={onKeyDown}
        >
          <m.div
            ref={observeCard}
            className="dp-dialog dp-tour-card"
            initial={motionAllowed ? { opacity: 0, scale: 0.96, x: place.x, y: place.y } : false}
            animate={{ opacity: 1, scale: 1, x: place.x, y: place.y }}
            transition={transition}
          >
            <p className="dp-tour-count">{stepLabel(index, steps.length)}</p>
            <Dialog.Title className="dp-tour-title">
              {step.title}
              <Underline key={index} />
            </Dialog.Title>
            <Dialog.Description className="dp-tour-text">{step.text}</Dialog.Description>
            <div className="dp-tour-actions">
              <button onClick={() => onFinish("skipped")}>Пропустить</button>
              <span className="dp-tour-moves">
                {index > 0 && <button onClick={() => move("back")}>Назад</button>}
                {last ? (
                  <button className="dp-primary" onClick={() => onFinish("done")}>
                    Готово
                  </button>
                ) : (
                  <button className="dp-primary" onClick={() => move("next")}>
                    Дальше
                  </button>
                )}
              </span>
            </div>
          </m.div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export default function DashboardTour({ onFinish }: { onFinish: (outcome: TourOutcome) => void }) {
  return (
    <MotionScope>
      <TourCard onFinish={onFinish} />
    </MotionScope>
  );
}
