import { type ReactNode, useRef } from "react";
import { Link } from "react-router";
import { Wordmark } from "../../shared/ui";
import { InkStroke } from "../../shared/ui/InkStroke";
import { usePointerLight } from "../../shared/ui/usePointerLight";
import "./auth.css";

const tickPath = "M5 21l10 10L41 5";

export function AuthLayout({
  title,
  lead,
  footer,
  aside,
  ticked = false,
  children,
}: {
  title: string;
  lead?: string;
  footer?: ReactNode;
  aside?: ReactNode;
  ticked?: boolean;
  children: ReactNode;
}) {
  const pageRef = useRef<HTMLDivElement>(null);
  const lampRef = useRef<HTMLDivElement>(null);
  usePointerLight(pageRef, lampRef);
  return (
    <div ref={pageRef} className={aside ? "dp-app dp-auth has-aside" : "dp-app dp-auth"}>
      <div ref={lampRef} className="dp-auth-lamp" aria-hidden="true" />
      <main id="main-content" className="dp-auth-card" tabIndex={-1}>
        <svg className="dp-auth-tick" viewBox="0 0 46 36" aria-hidden="true">
          <InkStroke d={tickPath} drawn={ticked} tone="ink" />
        </svg>
        <Link to="/login" className="dp-auth-brand">
          <Wordmark />
        </Link>
        <div>
          <h1>{title}</h1>
          {lead && <p className="dp-caption">{lead}</p>}
        </div>
        {children}
        {footer && <p className="dp-auth-footer">{footer}</p>}
      </main>
      {aside}
    </div>
  );
}
