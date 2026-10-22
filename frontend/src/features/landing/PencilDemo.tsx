import { useState } from "react";
import { AlertCircle, Check, PencilLine, PenLine } from "lucide-react";
import { Formula } from "../../shared/math";

export function PencilDemo() {
  const [confirmed, setConfirmed] = useState(false);
  return (
    <div className="dp-landing-window">
      <div className="dp-landing-window-bar">
        <span className="dp-landing-lights" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <strong>Уравнения и преобразования</strong>
        <span>Анна Соколова · 10 класс</span>
      </div>
      <div className="dp-landing-window-body">
        <p className="dp-landing-task">Упростите выражение и укажите допустимые значения x.</p>
        <div className="dp-landing-step">
          <span className="dp-landing-step-number">1</span>
          <Formula value={"\\frac{(x-3)(x+3)}{x-3}=x+3"} />
          <Check className="dp-landing-step-ok" size={18} aria-label="Верно" />
        </div>
        <div className="dp-landing-step is-wrong">
          <span className="dp-landing-step-number">2</span>
          <div>
            <strong>
              <AlertCircle size={16} aria-hidden="true" />
              Есть ошибка
            </strong>
            <Formula value={"x\\in\\mathbb{R}"} />
            <p>При x&nbsp;=&nbsp;3 исходное выражение не определено.</p>
          </div>
        </div>
        <section className="dp-landing-gap" data-decision={confirmed ? "confirmed" : "hypothesis"}>
          <h3>
            {confirmed ? (
              <PenLine size={14} aria-hidden="true" />
            ) : (
              <PencilLine size={14} aria-hidden="true" />
            )}
            {confirmed ? "Пробел подтверждён" : "Гипотеза ИИ"}
          </h3>
          <p className="dp-landing-gap-topic">Тема для повторения: область допустимых значений</p>
          <p>Повторить ограничения знаменателя и сохранение ОДЗ при сокращении дробей.</p>
          <button type="button" aria-pressed={confirmed} onClick={() => setConfirmed(!confirmed)}>
            {confirmed ? "Вернуть в гипотезу" : "Подтвердить пробел"}
          </button>
        </section>
      </div>
    </div>
  );
}
