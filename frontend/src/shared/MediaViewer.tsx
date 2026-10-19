import { lazy, Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Crop, ImageUp, RotateCcw, ZoomIn, ZoomOut } from "lucide-react";
import type { Attachment, CropRect, Upload } from "../domain/models";
import { gateway } from "../data/gateway";
import { ErrorMessage } from "./ui";
import "./media.css";
const PdfPage = lazy(() => import("./PdfPage"));

function swapWithNeighbour<T>(items: T[], index: number, direction: number): T[] | undefined {
  const target = index + direction;
  if (target < 0 || target >= items.length) return undefined;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function MediaViewer({
  files,
  update,
  uploads,
  lead,
}: {
  files: Attachment[];
  update?: (files: Attachment[]) => void;
  uploads?: Upload[];
  lead?: ReactNode;
}) {
  const [selected, setSelected] = useState(files[0]?.id || "");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [cropping, setCropping] = useState(false);
  const file = files.find((item) => item.id === selected) || files[0];
  const fileId = file?.id;
  const [source, setSource] = useState<{ id: string; url: string }>();
  const [error, setError] = useState<unknown>();
  const [width, setWidth] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const localBlob = uploads?.find((item) => item.id === fileId)?.blob;
  const area = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const measure = () => {
      const style = getComputedStyle(node);
      const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
      setWidth(Math.max(1, node.clientWidth - padding));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    let url: string | undefined;
    if (fileId) {
      const promise = localBlob ? Promise.resolve(localBlob) : gateway.asset(fileId);
      promise
        .then((blob) => {
          url = URL.createObjectURL(blob);
          if (active) {
            setSource({ id: fileId, url });
            setError(undefined);
          }
        })
        .catch((cause) => {
          if (active) setError(cause);
        });
    }
    return () => {
      active = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [fileId, localBlob, attempt]);
  if (!file)
    return (
      <section className="media-viewer">
        {lead && <div className="media-controls">{lead}</div>}
        <div className="media-empty">
          <ImageUp size={28} aria-hidden="true" />
          <p>Добавьте фото или PDF решения.</p>
        </div>
      </section>
    );
  const order = file.pageOrder.length
    ? file.pageOrder
    : Array.from({ length: file.pages }, (_, index) => index + 1);
  const activePage = order.includes(page) ? page : order[0];
  const crop = file.crops[String(activePage)] || { x: 0, y: 0, width: 1, height: 1 };
  const saveFile = (updated: Attachment) =>
    update?.(files.map((item) => (item.id === file.id ? updated : item)));
  const move = (direction: number) => {
    const index = files.findIndex((item) => item.id === file.id);
    const next = swapWithNeighbour(files, index, direction);
    if (next) update?.(next);
  };
  const movePage = (direction: number) => {
    const next = swapWithNeighbour(order, order.indexOf(activePage), direction);
    if (next) saveFile({ ...file, pageOrder: next });
  };
  const top = crop.y * 100;
  const right = (1 - crop.x - crop.width) * 100;
  const bottom = (1 - crop.y - crop.height) * 100;
  const left = crop.x * 100;
  return (
    <section className="media-viewer">
      <div className="media-controls">
        {lead}
        {files.length > 1 ? (
          <select
            aria-label="Оригинал работы"
            value={file.id}
            onChange={(event) => {
              setSelected(event.target.value);
              setPage(1);
              setZoom(1);
            }}
          >
            {files.map((item, index) => (
              <option key={item.id} value={item.id}>
                {index + 1}. {item.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="media-name">{file.name}</span>
        )}
        <button
          className="icon-button"
          aria-label="Уменьшить оригинал"
          onClick={() => setZoom(Math.max(0.5, zoom - 0.25))}
        >
          <ZoomOut size={18} />
        </button>
        <span className="media-zoom">{Math.round(zoom * 100)}%</span>
        <button
          className="icon-button"
          aria-label="Увеличить оригинал"
          onClick={() => setZoom(Math.min(3, zoom + 0.25))}
        >
          <ZoomIn size={18} />
        </button>
      </div>
      {update && (
        <div className="media-tools">
          {files.length > 1 && (
            <>
              <button onClick={() => move(-1)} disabled={files[0].id === file.id}>
                <ArrowUp size={14} />
                Файл выше
              </button>
              <button onClick={() => move(1)} disabled={files.at(-1)?.id === file.id}>
                <ArrowDown size={14} />
                Ниже
              </button>
            </>
          )}
          <button onClick={() => setCropping(!cropping)} aria-expanded={cropping}>
            <Crop size={14} />
            Кадрировать
          </button>
        </div>
      )}
      {cropping && update && (
        <CropControls
          key={file.id + ":" + activePage + ":" + JSON.stringify(crop)}
          crop={crop}
          onApply={(next) =>
            saveFile({ ...file, crops: { ...file.crops, [String(activePage)]: next } })
          }
        />
      )}
      {file.pages > 1 && (
        <div className="page-controls">
          <label>
            Страница
            <select
              aria-label="Страница оригинала"
              value={activePage}
              onChange={(event) => setPage(Number(event.target.value))}
            >
              {order.map((number, index) => (
                <option key={number} value={number}>
                  {index + 1} / {order.length} (исх. {number})
                </option>
              ))}
            </select>
          </label>
          {update && (
            <>
              <button
                aria-label="Переместить страницу выше"
                disabled={order[0] === activePage}
                onClick={() => movePage(-1)}
              >
                <ArrowUp size={16} />
              </button>
              <button
                aria-label="Переместить страницу ниже"
                disabled={order.at(-1) === activePage}
                onClick={() => movePage(1)}
              >
                <ArrowDown size={16} />
              </button>
            </>
          )}
        </div>
      )}
      <ErrorMessage error={error} />
      <div className="media-canvas" ref={area}>
        <div
          style={{
            width: width ? width * zoom : "100%",
            clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`,
          }}
        >
          {source?.id === file.id && width > 0 ? (
            file.type === "application/pdf" ? (
              <Suspense fallback={<MediaPlaceholder />}>
                <PdfPage url={source.url} page={activePage} width={Math.round(width * zoom)} />
              </Suspense>
            ) : (
              <img
                className="source-image"
                src={source.url}
                alt={"Оригинал: " + file.name}
                onError={() => setError(new Error("Изображение повреждено. Загрузите его заново."))}
              />
            )
          ) : error ? (
            <div className="media-placeholder">
              <p>Оригинал недоступен</p>
              <button onClick={() => setAttempt((value) => value + 1)}>Повторить</button>
            </div>
          ) : (
            <MediaPlaceholder />
          )}
        </div>
      </div>
      <div className="media-caption">
        {file.name} · {Math.round(file.size / 1024)} КБ
      </div>
    </section>
  );
}

function CropControls({ crop, onApply }: { crop: CropRect; onApply: (crop: CropRect) => void }) {
  const [values, setValues] = useState(() => ({
    x: String(Math.round(crop.x * 100)),
    y: String(Math.round(crop.y * 100)),
    width: String(Math.round(crop.width * 100)),
    height: String(Math.round(crop.height * 100)),
  }));
  return (
    <form
      className="crop-controls"
      onSubmit={(event) => {
        event.preventDefault();
        const x = Math.min(0.95, Math.max(0, Number(values.x) / 100));
        const y = Math.min(0.95, Math.max(0, Number(values.y) / 100));
        onApply({
          x,
          y,
          width: Math.min(1 - x, Math.max(0.05, Number(values.width) / 100)),
          height: Math.min(1 - y, Math.max(0.05, Number(values.height) / 100)),
        });
      }}
    >
      <p>Область просмотра, % · исходный файл сохраняется</p>
      {(["x", "y", "width", "height"] as const).map((key, index) => {
        const isSize = key === "width" || key === "height";
        return (
          <label key={key}>
            {["Слева", "Сверху", "Ширина", "Высота"][index]}
            <input
              type="number"
              required
              min={isSize ? 5 : 0}
              max={isSize ? 100 : 95}
              value={values[key]}
              onChange={(event) =>
                setValues((current) => ({ ...current, [key]: event.target.value }))
              }
            />
          </label>
        );
      })}
      <button type="submit" className="dp-primary">
        Применить область
      </button>
      <button type="button" onClick={() => onApply({ x: 0, y: 0, width: 1, height: 1 })}>
        <RotateCcw size={14} />
        Сбросить
      </button>
    </form>
  );
}

function MediaPlaceholder() {
  return (
    <div className="media-placeholder" role="status">
      <div className="dp-sk media-skeleton" aria-hidden="true" />
      <span>Открываем оригинал…</span>
    </div>
  );
}
