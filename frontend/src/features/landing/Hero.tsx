import { AlertCircle } from "lucide-react";
import { Link } from "react-router";
import type { LandingLinks } from "./links";

export function Hero({ links }: { links: LandingLinks }) {
  return (
    <section className="dp-landing-hero" aria-labelledby="landing-title">
      <div className="dp-landing-hero-text">
        <h1 id="landing-title">
          Разбор решения <mark>за минуты</mark>
        </h1>
        <p className="dp-landing-lead">
          Загрузите фото тетради. UpGrade разложит решение на шаги, найдёт место ошибки и предложит
          тему для повторения. Подтверждаете вы.
        </p>
        <div className="dp-landing-actions">
          <Link className="dp-landing-button is-marker" to={links.start}>
            {links.startLabel}
          </Link>
          {links.secondary && (
            <Link className="dp-landing-button" to={links.secondary}>
              {links.secondaryLabel}
            </Link>
          )}
        </div>
        <p className="dp-landing-note">
          Алгебра 9–11 класса. Имена учеников скрываются до анализа.
        </p>
      </div>
      <figure className="dp-landing-sheet">
        <div className="dp-notebook" role="img" aria-label="Фото решения ученика с пометкой ошибки">
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
        <svg className="dp-hand-arrow" viewBox="0 0 120 90" aria-hidden="true">
          <path d="M6 4c-2 30 22 58 92 62m-15-13 15 13-19 8" />
        </svg>
        <figcaption className="dp-landing-verdict">
          <strong>
            <AlertCircle size={16} aria-hidden="true" />
            Шаг 3: ошибка
          </strong>
          <span>
            При x&nbsp;=&nbsp;3 исходное выражение не определено. Нужно ограничение x&nbsp;≠&nbsp;3.
          </span>
          <em>Тема: область допустимых значений</em>
        </figcaption>
      </figure>
    </section>
  );
}
