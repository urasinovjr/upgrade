import type { ReactNode } from "react";
import { Link } from "react-router";
import { ArrowUpRight } from "lucide-react";
import "./auth.css";

export function AuthLayout({
  title,
  lead,
  footer,
  children,
}: {
  title: string;
  lead?: string;
  footer?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="dp-app dp-auth">
      <main id="main-content" className="dp-auth-card" tabIndex={-1}>
        <Link to="/login" className="dp-auth-brand">
          <span className="dp-brand-mark" aria-hidden="true">
            <ArrowUpRight size={14} strokeWidth={2.5} />
          </span>
          UpGrade
        </Link>
        <div>
          <h1>{title}</h1>
          {lead && <p className="dp-caption">{lead}</p>}
        </div>
        {children}
        {footer && <p className="dp-auth-footer">{footer}</p>}
      </main>
    </div>
  );
}
