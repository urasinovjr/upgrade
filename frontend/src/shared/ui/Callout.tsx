import type { ReactNode } from "react";

export type CalloutTone = "warning" | "danger" | "info" | "neutral";

export function Callout({
  tone,
  icon,
  title,
  more,
  role,
  boxed = false,
  children,
}: {
  tone: CalloutTone;
  icon: ReactNode;
  title: string;
  more?: string;
  role?: "status" | "alert";
  boxed?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={"dp-callout dp-callout-" + tone + (boxed ? " dp-callout-boxed" : "")}
      role={role}
    >
      {icon}
      <p>
        <strong>{title}</strong>
        {more && <span className="dp-callout-more"> {more}</span>}
      </p>
      {children && <div className="dp-callout-actions">{children}</div>}
    </div>
  );
}
