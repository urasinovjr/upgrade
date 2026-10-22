import { useRef, useState, type PointerEvent } from "react";
import { CircleAlert, CircleCheck, Trash2 } from "lucide-react";
import type { Attachment, CropRect } from "../domain/models";
import { maxMasksPerPage, sentPageCount, uncheckedPages } from "../domain/redaction";
import { RectFields } from "./RectFields";
import { rectFromPercent, useRectFields } from "./rectPercent";

const minMaskSize = 0.01;
const newMask = { x: 0, y: 0, width: 0.3, height: 0.08 };

interface Point {
  x: number;
  y: number;
}

function boxStyle(rect: CropRect) {
  return {
    left: rect.x * 100 + "%",
    top: rect.y * 100 + "%",
    width: rect.width * 100 + "%",
    height: rect.height * 100 + "%",
  };
}

function rectBetween(start: Point, end: Point): CropRect {
  const x = Math.max(0, Math.min(start.x, end.x));
  const y = Math.max(0, Math.min(start.y, end.y));
  return {
    x,
    y,
    width: Math.min(1, Math.max(start.x, end.x)) - x,
    height: Math.min(1, Math.max(start.y, end.y)) - y,
  };
}

function pointIn(event: PointerEvent<HTMLDivElement>): Point {
  const box = event.currentTarget.getBoundingClientRect();
  return {
    x: Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)),
    y: Math.min(1, Math.max(0, (event.clientY - box.top) / box.height)),
  };
}

export function MaskLayer({
  masks,
  drawing,
  onDraw,
}: {
  masks: CropRect[];
  drawing: boolean;
  onDraw: (mask: CropRect) => void;
}) {
  const start = useRef<Point>(undefined);
  const [preview, setPreview] = useState<CropRect>();
  const finish = (event: PointerEvent<HTMLDivElement>) => {
    if (!start.current) return;
    const rect = rectBetween(start.current, pointIn(event));
    start.current = undefined;
    setPreview(undefined);
    if (rect.width >= minMaskSize && rect.height >= minMaskSize) onDraw(rect);
  };
  return (
    <div
      className={"mask-layer" + (drawing ? " is-drawing" : "")}
      data-testid="mask-layer"
      onPointerDown={(event) => {
        if (!drawing || masks.length >= maxMasksPerPage) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start.current = pointIn(event);
      }}
      onPointerMove={(event) => {
        if (start.current) setPreview(rectBetween(start.current, pointIn(event)));
      }}
      onPointerUp={finish}
      onPointerCancel={() => {
        start.current = undefined;
        setPreview(undefined);
      }}
    >
      {masks.map((mask, index) => (
        <div key={index} className="mask-box" style={boxStyle(mask)} aria-hidden="true">
          <span>Скрыто</span>
        </div>
      ))}
      {preview && <div className="mask-box is-preview" style={boxStyle(preview)} />}
    </div>
  );
}

export function MaskControls({
  masks,
  onChange,
}: {
  masks: CropRect[];
  onChange: (masks: CropRect[]) => void;
}) {
  const [values, setValues] = useRectFields(newMask);
  const full = masks.length >= maxMasksPerPage;
  return (
    <div className="mask-controls">
      <p>
        Закройте имя ученика и другие личные данные: проведите по странице или задайте область в
        процентах. ИИ получит страницу с закрашенными областями.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          onChange([...masks, rectFromPercent(values, minMaskSize)]);
        }}
      >
        <RectFields values={values} setValues={setValues} minSize={minMaskSize} />
        <button type="submit" className="dp-primary" disabled={full}>
          Добавить маску
        </button>
      </form>
      {full && <p>На странице не больше {maxMasksPerPage} масок.</p>}
      {masks.length > 0 && (
        <ol className="mask-list" aria-label="Маски на странице">
          {masks.map((mask, index) => (
            <li key={index}>
              <span>
                Маска {index + 1}: {Math.round(mask.x * 100)}% слева, {Math.round(mask.y * 100)}%
                сверху, {Math.round(mask.width * 100)}×{Math.round(mask.height * 100)}%
              </span>
              <button
                type="button"
                aria-label={"Удалить маску " + (index + 1)}
                onClick={() => onChange(masks.filter((_, item) => item !== index))}
              >
                <Trash2 size={14} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

export function PageCheck({
  files,
  file,
  page,
  onCheck,
}: {
  files: Attachment[];
  file: Attachment;
  page: number;
  onCheck?: (checked: boolean) => void;
}) {
  const checked = file.checkedPages.includes(page);
  const total = sentPageCount(files);
  const done = total - uncheckedPages(files).length;
  const Icon = checked ? CircleCheck : CircleAlert;
  return (
    <div className="page-check" role="group" aria-label="Обезличивание страницы">
      <span className={"dp-badge dp-tone-" + (checked ? "success" : "warning")}>
        <Icon size={12} aria-hidden="true" />
        {checked ? "Страница проверена" : "Страница не проверена"}
      </span>
      {onCheck && (
        <button type="button" onClick={() => onCheck(!checked)}>
          {checked ? "Снять отметку" : "Отметить страницу проверенной"}
        </button>
      )}
      <span className="page-check-count">
        Проверено {done} из {total}
      </span>
    </div>
  );
}
