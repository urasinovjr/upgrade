import { ShieldCheck } from "lucide-react";
import "../homework/homework.css";
import "./review.css";
import type { ReviewController } from "./useReviewController";
export function ReviewActions({ context }: { context: ReviewController }) {
  const {
    work,
    busy,
    blockers,
    action,
    pinnedActions,
    setWithdraw,
    ids,
    tasks,
    published,
    checked,
    workHint,
    nextButton,
    reportLink,
  } = context;
  return (
    <footer
      className="dp-review-actions review-footer"
      ref={pinnedActions}
      aria-label="Завершение проверки"
    >
      {work.editing ? (
        <>
          <div className="dp-review-progress">
            <span className="dp-progress-line">
              <strong>
                Проверено {checked} из {tasks.length}
              </strong>
              <span className="dp-progress-track" aria-hidden="true">
                <span style={{ width: (checked / Math.max(1, tasks.length)) * 100 + "%" }} />
              </span>
            </span>
            <span id={ids.reason} className="dp-review-reason">
              {workHint || "Всё проверено, можно опубликовать результат"}
            </span>
          </div>
          <div className="dp-review-buttons">
            <button
              className="dp-primary"
              data-audit="confirm-work"
              disabled={blockers.length > 0 || busy}
              aria-describedby={ids.reason}
              onClick={() => void action("confirm")}
            >
              <ShieldCheck size={16} aria-hidden="true" />
              <span>Опубликовать результат</span>
            </button>
            {nextButton(false)}
          </div>
        </>
      ) : (
        <>
          <div className="dp-confirmed">
            <ShieldCheck size={16} aria-hidden="true" />
            <p>
              <strong>Версия {published?.number} опубликована</strong>
              <span className="dp-confirmed-note">
                Карта знаний ученика обновлена. Следующий шаг: отчёт для ученика
              </span>
            </p>
          </div>
          <div className="dp-review-buttons">
            <button
              className="dp-text dp-danger-text"
              aria-label="Отозвать публикацию"
              onClick={() => setWithdraw(true)}
            >
              Отозвать
            </button>
            {reportLink}
            {nextButton(true)}
          </div>
        </>
      )}
    </footer>
  );
}
