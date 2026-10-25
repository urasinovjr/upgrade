import { useEffect, useState } from "react";
import "@fontsource/caveat/600.css";
import { InkStroke } from "../../shared/ui/InkStroke";

const tickPath = "M3 10l4 4 9-10";
const circlePath =
  "M14 34c-2-14 22-24 52-24 30 0 50 8 48 22-2 15-30 22-58 21C26 52 12 44 16 30c2-7 10-12 18-14";

export function AuthAside({ caption }: { caption: string }) {
  const [drawn, setDrawn] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <aside className="dp-auth-aside">
      <div className="dp-auth-notebook" aria-hidden="true">
        <span className="is-task">Упростите: (x² − 9) / (x − 3)</span>
        <span>
          = (x − 3)(x + 3) / (x − 3)
          <svg viewBox="0 0 20 18">
            <InkStroke d={tickPath} drawn={drawn} tone="ink" delay={500} />
          </svg>
        </span>
        <span>
          = x + 3
          <svg viewBox="0 0 20 18">
            <InkStroke d={tickPath} drawn={drawn} tone="ink" delay={700} />
          </svg>
        </span>
        <span className="is-wrong">
          x ∈ ℝ
          <svg viewBox="0 0 120 60" preserveAspectRatio="none">
            <InkStroke d={circlePath} drawn={drawn} delay={900} />
          </svg>
        </span>
      </div>
      <p className="dp-auth-quote">
        ИИ пишет карандашом, вы — <mark>ручкой</mark>
      </p>
      <p className="dp-auth-caption">{caption}</p>
    </aside>
  );
}
