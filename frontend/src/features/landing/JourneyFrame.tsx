import { type CSSProperties, type ReactNode } from "react";
import { InkStroke } from "../../shared/ui/InkStroke";

interface JourneyFrameProps {
  stage: number;
  settled: boolean;
}

const checkPath = "M4 10.5l4 4 8-9";
const circlePath =
  "M14 34c-2-14 22-24 52-24 30 0 50 8 48 22-2 15-30 22-58 21C26 52 12 44 16 30c2-7 10-12 18-14";
const arrowPath = "M232 62c6 7 7 14 4 22m-7-6 7 6 5-8";
const linkPaths = ["M0 9C12 9 12 20.5 24 20.5", "M0 32C12 32 12 20.5 24 20.5"];

function lineStyle(index: number) {
  return { "--line-index": index } as CSSProperties;
}

function Check({ drawn, delay }: { drawn: boolean; delay: number }) {
  return (
    <svg className="dp-journey-check" viewBox="0 0 20 20">
      <InkStroke d={checkPath} drawn={drawn} tone="ink" delay={delay} />
    </svg>
  );
}

function Line({
  index,
  marked,
  children,
}: {
  index: number;
  marked: boolean;
  children: ReactNode;
}) {
  return (
    <span className="dp-journey-line" data-marked={marked} style={lineStyle(index)}>
      {children}
    </span>
  );
}

export function JourneyFrame({ stage, settled }: JourneyFrameProps) {
  const shown = (index: number) => stage >= index;
  const reached = (index: number) => stage > index || (stage === index && settled);
  return (
    <div className="dp-journey-frame" aria-hidden="true">
      <div className="dp-journey-photo" data-placed={reached(0)} data-dim={shown(3)}>
        <span className="dp-journey-name">
          <span className="dp-journey-redact" data-drawn={reached(0)}>
            Анна Соколова
          </span>
          , 10 класс
        </span>
        <span className="dp-journey-task">Упростите: (x² − 9) / (x − 3)</span>
        <Line index={0} marked={shown(1)}>
          = (x − 3)(x + 3) / (x − 3)
          <Check drawn={reached(1)} delay={200} />
        </Line>
        <Line index={1} marked={shown(1)}>
          = x + 3
          <Check drawn={reached(1)} delay={400} />
        </Line>
        <Line index={2} marked={shown(1)}>
          <span className="dp-journey-margin" data-shown={reached(1)}>
            !
          </span>
          <span className="dp-journey-wrong">
            x ∈ ℝ
            <svg className="dp-journey-circle" viewBox="0 0 120 60" preserveAspectRatio="none">
              <InkStroke d={circlePath} drawn={reached(1)} delay={600} />
            </svg>
          </span>
        </Line>
      </div>

      <div
        className="dp-journey-gap"
        data-shown={shown(2)}
        data-confirmed={reached(2)}
        data-dim={shown(3)}
      >
        <span className="dp-journey-swap">
          <span data-active={!reached(2)}>Гипотеза ИИ</span>
          <span data-active={reached(2)}>Пробел подтверждён</span>
        </span>
        <strong>Область допустимых значений</strong>
      </div>

      <div className="dp-journey-map" data-shown={shown(2)} data-dim={shown(3)}>
        <span className="dp-journey-node is-path">Дроби</span>
        <span className="dp-journey-node is-path">Степени</span>
        <svg className="dp-journey-links" viewBox="0 0 24 41" preserveAspectRatio="none">
          {linkPaths.map((d) => (
            <InkStroke key={d} d={d} drawn={shown(2)} tone="pencil" dashed delay={300} />
          ))}
        </svg>
        <span className="dp-journey-node is-target" data-gap={reached(2)}>
          ОДЗ
        </span>
      </div>

      <svg className="dp-journey-overlay" viewBox="0 0 300 180" data-dim={shown(3)}>
        <InkStroke d={arrowPath} drawn={reached(2)} tone="ink" delay={200} />
      </svg>

      <div className="dp-journey-report" data-shown={shown(3)}>
        <strong>Отчёт по работе</strong>
        <span className="dp-journey-meta">Анна, 10 класс</span>
        <ul>
          <li>Шаги 1 и 2 — верно</li>
          <li>Шаг 3 — не учтено условие x ≠ 3</li>
          <li>
            <mark>Повторить: область допустимых значений</mark>
          </li>
        </ul>
        <span className="dp-journey-actions">
          <span>Скопировать текст</span>
          <span>PDF</span>
        </span>
        <span className="dp-journey-sent" data-shown={reached(3)}>
          <svg viewBox="0 0 20 20">
            <InkStroke d={checkPath} drawn={reached(3)} tone="ink" delay={250} />
          </svg>
          Отправлено
        </span>
      </div>
    </div>
  );
}
