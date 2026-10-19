import { useId, type ReactNode } from "react";

export function WidgetSection({
  title,
  caption,
  count,
  children,
}: {
  title: string;
  caption?: string;
  count?: number;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section className="dp-insight" aria-labelledby={id}>
      <div className="dp-chart-heading">
        <div>
          <h2 id={id}>
            {title}
            {!!count && <span className="dp-count">{count}</span>}
          </h2>
          {caption && <p>{caption}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function WidgetEmpty({ children }: { children: ReactNode }) {
  return <p className="dp-chart-empty dp-insight-empty">{children}</p>;
}
