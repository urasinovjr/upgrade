import { useState } from "react";
import { CircleCheck } from "lucide-react";
import { topics } from "../../data/fixtures";

type PreviewState = "gap" | "path" | "closed" | "none";

const states: Record<string, PreviewState> = {
  fractions: "path",
  powers: "path",
  domain: "gap",
  equations: "closed",
};

const columns = [
  { title: "Основа", ids: ["fractions", "powers"] },
  { title: "Ограничения и уравнения", ids: ["domain", "equations"] },
  { title: "Дальше по программе", ids: ["roots", "inequalities", "logs"] },
];

const legend: { state: PreviewState; label: string }[] = [
  { state: "gap", label: "Пробел подтверждён" },
  { state: "path", label: "Ведёт к пробелу" },
  { state: "closed", label: "Пробел закрыт" },
  { state: "none", label: "Нет данных" },
];

export function MapPreview() {
  const [selected, setSelected] = useState("domain");
  const topic = topics.find((item) => item.id === selected);
  return (
    <div className="dp-landing-map">
      <div className="dp-landing-map-side">
        <p className="dp-landing-map-student">
          <span className="dp-landing-avatar" aria-hidden="true">
            АС
          </span>
          Анна Соколова, 10 класс
        </p>
        <ul className="dp-landing-legend">
          {legend.map((item) => (
            <li key={item.state}>
              <span className={"dp-landing-node-sample is-" + item.state} aria-hidden="true" />
              {item.label}
            </li>
          ))}
        </ul>
        {topic && (
          <div className="dp-landing-map-detail" aria-live="polite">
            <strong>{topic.name}</strong>
            <span>{topic.description}</span>
          </div>
        )}
      </div>
      <div className="dp-landing-map-columns">
        {columns.map((column) => (
          <div key={column.title}>
            <h3>{column.title}</h3>
            {column.ids.map((id) => {
              const item = topics.find((entry) => entry.id === id);
              if (!item) return null;
              const state = states[id] ?? "none";
              return (
                <button
                  key={id}
                  type="button"
                  className={"dp-landing-node is-" + state}
                  aria-pressed={selected === id}
                  onClick={() => setSelected(id)}
                >
                  {state === "closed" && <CircleCheck size={15} aria-hidden="true" />}
                  {item.name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
