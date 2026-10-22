import { AlertCircle, ArrowRight, FileText, LoaderCircle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { ErrorMessage } from "./ErrorMessage";

export type PageVariant = "dashboard" | "list" | "form" | "review" | "student" | "report";

export function PageState({
  title,
  description,
  error,
  retry,
  to,
  linkLabel,
  icon,
  level = 1,
}: {
  title: string;
  description?: string;
  error?: unknown;
  retry?: () => void;
  to?: string;
  linkLabel?: string;
  icon?: LucideIcon;
  level?: 1 | 2;
}) {
  const Heading = level === 1 ? "h1" : "h2";
  const SubHeading = level === 1 ? "h2" : "h3";
  const failedLoad = Boolean(retry);
  const Icon = icon ?? (error ? AlertCircle : FileText);
  return (
    <div className="dp-state-page">
      {failedLoad && <Heading className="dp-visually-hidden">{title}</Heading>}
      <div className="dp-empty dp-page-state">
        <span className="dp-empty-mark" aria-hidden="true">
          <Icon size={28} />
          <svg viewBox="0 0 80 64">
            <path d="M18 40C14 24 30 10 46 9c16-1 28 9 27 24-1 16-18 25-36 24C21 56 9 46 13 32c2-8 9-14 17-17" />
          </svg>
        </span>
        {failedLoad ? (
          <SubHeading>Не удалось загрузить данные</SubHeading>
        ) : (
          <Heading>{title}</Heading>
        )}
        {(description || failedLoad) && (
          <p>{description || "Попробуйте ещё раз. Вы сможете продолжить с того же места."}</p>
        )}
        <ErrorMessage error={error} />
        {(retry || to) && (
          <div className="dp-page-state-actions">
            {retry && (
              <button onClick={retry}>
                Повторить загрузку
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            )}
            {to && (
              <Link className="dp-button" to={to}>
                {linkLabel || "Вернуться"}
              </Link>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const layouts: Record<PageVariant, string[][]> = {
  dashboard: [
    ["kpi", "kpi", "kpi", "kpi", "kpi"],
    ["wide", "side"],
  ],
  list: [["bar"], ["row", "row", "row", "row", "row", "row"]],
  form: [["half", "half"]],
  review: [["bar"], ["half", "half"]],
  student: [["head"], ["bar"], ["wide", "side"]],
  report: [["sheet"]],
};

export function PageLoading({
  variant = "list",
  children,
}: {
  variant?: PageVariant;
  children?: ReactNode;
}) {
  return (
    <div className="dp-state-page dp-page-loading" role="status" aria-busy="true">
      <span className="dp-loading-caption">
        <LoaderCircle className="dp-spin" size={16} aria-hidden="true" />
        Загружаем рабочее пространство
      </span>
      {children ? (
        <div aria-hidden="true">{children}</div>
      ) : (
        <div className={"dp-sk-layout dp-sk-" + variant} aria-hidden="true">
          {layouts[variant].map((row, rowIndex) => (
            <div className="dp-sk-row" key={rowIndex}>
              {row.map((shape, index) => (
                <div className={"dp-sk dp-sk-" + shape} key={index} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
