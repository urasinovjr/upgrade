import { type CSSProperties, useId } from "react";

export type InkTone = "pen" | "ink" | "pencil";

interface InkStrokeProps {
  d: string;
  drawn: boolean;
  tone?: InkTone;
  dashed?: boolean;
  delay?: number;
}

export function InkStroke({ d, drawn, tone = "pen", dashed = false, delay = 0 }: InkStrokeProps) {
  const maskId = useId();
  const style = { "--ink-delay": `${delay}ms` } as CSSProperties;
  if (!dashed) {
    return (
      <path
        className="dp-ink-stroke"
        data-tone={tone}
        data-drawn={drawn}
        d={d}
        pathLength={1}
        style={style}
      />
    );
  }
  return (
    <g>
      <mask id={maskId} maskUnits="userSpaceOnUse">
        <path
          className="dp-ink-stroke dp-ink-mask"
          data-drawn={drawn}
          d={d}
          pathLength={1}
          style={style}
        />
      </mask>
      <path className="dp-ink-dashed" data-tone={tone} d={d} mask={`url(#${maskId})`} />
    </g>
  );
}
