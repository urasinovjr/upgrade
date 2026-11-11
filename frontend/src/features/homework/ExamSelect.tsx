import exams from "../../data/exams.json";
import type { ExamPosition } from "../../domain/homework";

function examName(exam: { exam: string; level: string | null; year: number }) {
  return (
    (exam.exam === "oge" ? "ОГЭ" : exam.level === "basic" ? "ЕГЭ, базовый" : "ЕГЭ, профильный") +
    ", " +
    exam.year
  );
}

export function ExamSelect({
  value,
  onChange,
}: {
  value?: ExamPosition | null;
  onChange: (value: ExamPosition | null) => void;
}) {
  const selected = exams.findIndex(
    (exam) =>
      exam.exam === value?.exam &&
      exam.level === (value?.level ?? null) &&
      exam.year === value?.year &&
      exam.documentVersion === value?.documentVersion,
  );
  const choose = (index: number, position = 1) => {
    const exam = exams[index];
    onChange(
      exam
        ? {
            exam: exam.exam as "oge" | "ege",
            level: exam.level as ExamPosition["level"],
            year: exam.year,
            documentVersion: exam.documentVersion,
            position,
          }
        : null,
    );
  };
  return (
    <div className="hw-exam-fields">
      <label>
        Источник
        <select value={selected} onChange={(event) => choose(Number(event.target.value))}>
          <option value={-1}>Другой источник</option>
          {exams.map((exam, index) => (
            <option key={index} value={index}>
              {examName(exam)}
              {exam.status === "project" ? " · проект" : ""}
            </option>
          ))}
        </select>
      </label>
      {selected >= 0 && (
        <label>
          Позиция в экзамене
          <select
            value={value?.position ?? 1}
            onChange={(event) => choose(selected, Number(event.target.value))}
          >
            {exams[selected].positions.map((position) => (
              <option key={position.position} value={position.position}>
                № {position.position} · {position.name}
              </option>
            ))}
          </select>
        </label>
      )}
      {selected >= 0 && (
        <p className="dp-caption">
          {exams[selected].status === "project" ? "Проект документов ФИПИ. " : "Документы ФИПИ. "}
          <a href={exams[selected].source} target="_blank" rel="noreferrer">
            Посмотреть источник
          </a>
        </p>
      )}
    </div>
  );
}
