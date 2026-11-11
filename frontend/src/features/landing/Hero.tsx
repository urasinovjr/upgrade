import { type CSSProperties, type ReactNode, useRef } from "react";
import { AlertCircle } from "lucide-react";
import * as m from "motion/react-m";
import { Link } from "react-router";
import { useMotionAllowed } from "../../shared/ui/motionPreference";
import { usePointerLight } from "../../shared/ui/usePointerLight";
import { InkWater } from "./InkWater";
import type { LandingLinks } from "./links";
import { MagnetLink } from "./MagnetLink";
import { useHeroDepth } from "./useHeroDepth";

function Rise({ index, children }: { index: number; children: ReactNode }) {
  return (
    <span className="dp-landing-rise" style={{ "--rise-index": index } as CSSProperties}>
      <span>{children}</span>
    </span>
  );
}

export function Hero({ links }: { links: LandingLinks }) {
  const heroRef = useRef<HTMLElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const motionAllowed = useMotionAllowed();
  const interactive = usePointerLight(heroRef, lampRef);
  const depth = useHeroDepth(heroRef, { pointer: interactive, scroll: motionAllowed });
  return (
    <section
      ref={heroRef}
      className="dp-landing-hero"
      aria-labelledby="landing-title"
      onPointerMove={depth.onPointerMove}
      onPointerLeave={depth.onPointerLeave}
    >
      <InkWater area={heroRef} text={textRef} />
      <div ref={lampRef} className="dp-landing-lamp" aria-hidden="true" />
      <div ref={textRef} className="dp-landing-hero-text">
        <h1 id="landing-title">
          <Rise index={0}>ИИ</Rise> <Rise index={1}>пишет</Rise> <Rise index={2}>карандашом,</Rise>{" "}
          <Rise index={3}>вы</Rise> <Rise index={4}>—</Rise>{" "}
          <Rise index={5}>
            <mark>ручкой</mark>
          </Rise>
        </h1>
        <p className="dp-landing-lead">
          Загрузите фото тетради. UpGrade разложит решение по шагам, отметит ошибку и предложит,
          какую тему повторить. В отчёт попадёт опубликованный вами результат
        </p>
        <div className="dp-landing-actions">
          <MagnetLink className="dp-landing-button is-marker" to={links.start}>
            {links.startLabel}
          </MagnetLink>
          {links.secondary && (
            <Link className="dp-landing-button" to={links.secondary}>
              {links.secondaryLabel}
            </Link>
          )}
        </div>
        <p className="dp-landing-note">Алгебра 9–11 класса. Имя ученика закрашивается до разбора</p>
      </div>
      <m.figure className="dp-landing-sheet" style={depth.sheet}>
        <div className="dp-notebook" role="img" aria-label="Фото решения ученика с пометкой ошибки">
          <svg
            className="dp-notebook-rule"
            viewBox="0 0 4 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line x1="2" y1="0" x2="2" y2="100" vectorEffect="non-scaling-stroke" />
          </svg>
          <span className="dp-notebook-line is-task">Упростите: (x² − 9) / (x − 3)</span>
          <span className="dp-notebook-line">= (x − 3)(x + 3) / (x − 3)</span>
          <span className="dp-notebook-line">= x + 3</span>
          <span className="dp-notebook-line">
            <span className="dp-notebook-margin">!</span>
            <span className="dp-notebook-wrong">
              x ∈ ℝ
              <svg className="dp-pen-stroke" viewBox="0 0 120 60" preserveAspectRatio="none">
                <path d="M14 34c-2-14 22-24 52-24 30 0 50 8 48 22-2 15-30 22-58 21C26 52 12 44 16 30c2-7 10-12 18-14" />
              </svg>
            </span>
            <span className="dp-notebook-note">а x = 3?</span>
          </span>
        </div>
        <m.svg
          className="dp-hand-arrow"
          viewBox="0 0 120 90"
          aria-hidden="true"
          style={depth.arrow}
        >
          <path d="M6 4c-2 30 22 58 92 62m-15-13 15 13-19 8" />
        </m.svg>
        <m.figcaption className="dp-landing-verdict" style={depth.verdict}>
          <strong>
            <AlertCircle size={16} aria-hidden="true" />
            Ошибка в шаге 3
          </strong>
          <span>При x&nbsp;=&nbsp;3 знаменатель равен нулю. Добавьте условие x&nbsp;≠&nbsp;3.</span>
          <em>Что повторить: область допустимых значений</em>
        </m.figcaption>
      </m.figure>
    </section>
  );
}
