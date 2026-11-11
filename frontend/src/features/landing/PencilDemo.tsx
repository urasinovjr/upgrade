import { type CSSProperties, useRef, useState } from "react";
import { AlertCircle, PencilLine, PenLine } from "lucide-react";
import { Formula } from "../../shared/math";
import { InkStroke } from "../../shared/ui/InkStroke";
import { CircleSurface } from "./CircleSurface";
import { useAutoplay } from "./useAutoplay";

const script = [
  { shown: 1, decided: false, duration: 700 },
  { shown: 2, decided: false, duration: 1100 },
  { shown: 3, decided: false, duration: 1500 },
  { shown: 4, decided: false, duration: 1900 },
  { shown: 4, decided: true, duration: 2800 },
  { shown: 4, decided: false, duration: 1000 },
  { shown: 1, decided: false, duration: 900 },
];
const durations = script.map((frame) => frame.duration);

function leaveDelay(milliseconds: number) {
  return { "--leave-delay": `${milliseconds}ms` } as CSSProperties;
}

function StepCheck({ drawn }: { drawn: boolean }) {
  return (
    <span className="dp-landing-step-ok" role="img" aria-label="Верно">
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <InkStroke d="M4 10.5l4 4 8-9" drawn={drawn} delay={250} />
      </svg>
    </span>
  );
}

export function PencilDemo() {
  const [confirmed, setConfirmed] = useState(false);
  const [circledByHand, setCircledByHand] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const autoplay = useAutoplay(ref, durations, (frame) => setConfirmed(script[frame].decided));
  const current = script[autoplay.frame];
  const shown = (step: number) => !autoplay.playing || current.shown >= step;
  const decided = autoplay.playing ? current.decided : confirmed;
  const handKept = decided && circledByHand;

  function toggle() {
    setConfirmed((value) => !value);
    setCircledByHand(false);
  }

  function circle() {
    setConfirmed(true);
    setCircledByHand(true);
  }

  return (
    <div ref={ref} className="dp-landing-window" data-playing={autoplay.playing}>
      <div className="dp-landing-window-bar">
        <span className="dp-landing-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>Уравнения и преобразования</strong>
        <span>Анна Соколова · 10 класс</span>
      </div>
      <div className="dp-landing-window-body">
        <p className="dp-landing-task">Упростите выражение и укажите допустимые значения x.</p>
        <div className="dp-landing-step" data-shown={shown(1)}>
          <span className="dp-landing-step-number">1</span>
          <Formula value={"\\frac{x^2-9}{x-3}=\\frac{(x-3)(x+3)}{x-3}"} />
          <StepCheck drawn={shown(1)} />
        </div>
        <div className="dp-landing-step" data-shown={shown(2)} style={leaveDelay(180)}>
          <span className="dp-landing-step-number">2</span>
          <Formula value={"=x+3"} />
          <StepCheck drawn={shown(2)} />
        </div>
        <div className="dp-landing-step is-wrong" data-shown={shown(3)} style={leaveDelay(90)}>
          <span className="dp-landing-step-number">3</span>
          <CircleSurface kept={handKept} onCircle={circle}>
            <strong>
              <AlertCircle size={16} aria-hidden="true" />
              Ошибка
            </strong>
            <span className="dp-landing-wrong-formula" data-circle-target>
              <Formula value={"x\\in\\mathbb{R}"} />
              <svg
                className="dp-landing-auto-circle"
                viewBox="0 0 120 60"
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <InkStroke
                  d="M14 34c-2-14 22-24 52-24 30 0 50 8 48 22-2 15-30 22-58 21C26 52 12 44 16 30c2-7 10-12 18-14"
                  drawn={decided && !circledByHand}
                  tone="ink"
                />
              </svg>
            </span>
            <p>При x&nbsp;=&nbsp;3 исходное выражение не определено.</p>
          </CircleSurface>
          <span className="dp-landing-circle-hint" data-hidden={decided} aria-hidden="true">
            Обведите ошибку ручкой
          </span>
        </div>
        <section
          className="dp-landing-gap"
          data-decision={decided ? "confirmed" : "hypothesis"}
          data-shown={shown(4)}
        >
          <h3 className="dp-landing-swap">
            <span data-active={!decided} aria-hidden={decided}>
              <PencilLine size={14} aria-hidden="true" />
              Гипотеза ИИ
            </span>
            <span data-active={decided} aria-hidden={!decided}>
              <PenLine size={14} aria-hidden="true" />
              Пробел подтверждён
            </span>
          </h3>
          <p className="dp-landing-gap-topic">Тема: область допустимых значений</p>
          <p>
            Что повторить: почему знаменатель не равен нулю и как ОДЗ сохраняется при сокращении
            дроби.
          </p>
          <button type="button" onClick={toggle}>
            <span className="dp-landing-swap">
              <span data-active={!decided} aria-hidden={decided}>
                Подтвердить гипотезу
              </span>
              <span data-active={decided} aria-hidden={!decided}>
                Отменить подтверждение
              </span>
            </span>
          </button>
        </section>
      </div>
    </div>
  );
}
