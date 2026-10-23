import { lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Crop, EyeOff, ImageUp, ZoomIn, ZoomOut } from "lucide-react";
import type { Attachment, Upload } from "../domain/models";
import { keptChecks, pageMasks, withCheck, withMasks } from "../domain/redaction";
import type { OriginFocus } from "../domain/stepOrigin";
import { gateway } from "../data/gateway";
import { useActiveTime } from "../features/timing/useActiveTime";
import { CropControls } from "./CropControls";
import { FocusBox, MaskControls, MaskLayer, PageCheck } from "./MaskEditor";
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

function revealFocus(box: HTMLElement | null) {
  const canvas = box?.closest<HTMLElement>(".media-canvas");
  if (!box || !canvas) return;
  const offset = box.getBoundingClientRect().top - canvas.getBoundingClientRect().top;
  canvas.scrollTop += offset - canvas.clientHeight / 4;
  canvas.scrollIntoView({ block: "start" });
}

export function MediaViewer({
  files,
  update,
  uploads,
  lead,
  redaction = false,
  focus,
}: {
  files: Attachment[];
  update?: (files: Attachment[]) => void;
  uploads?: Upload[];
  lead?: ReactNode;
  redaction?: boolean;
  focus?: OriginFocus;
}) {
  const [selected, setSelected] = useState(files[0]?.id || "");
  const [page, setPage] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [tool, setTool] = useState<"crop" | "mask">();
  useActiveTime(tool === "mask" ? "masking" : undefined);
  const [shownFocus, setShownFocus] = useState<number>();
  const focusBox = useRef<HTMLDivElement>(null);
  if (focus && focus.nonce !== shownFocus) {
    setShownFocus(focus.nonce);
    setSelected(focus.fileId);
    setPage(focus.page);
  }
  const file = files.find((item) => item.id === selected) || files[0];
  const fileId = file?.id;
  const [source, setSource] = useState<{ id: string; url: string }>();
  const [error, setError] = useState<unknown>();
  const [width, setWidth] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const localBlob = uploads?.find((item) => item.id === fileId)?.blob;
  useEffect(() => {
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => revealFocus(focusBox.current));
    });
    return () => cancelAnimationFrame(frame);
  }, [shownFocus, source]);
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
  const masks = pageMasks(file, activePage);
  const saveFile = (updated: Attachment) => {
    const next = { ...updated, checkedPages: keptChecks(file, updated) };
    update?.(files.map((item) => (item.id === file.id ? next : item)));
  };
  const toggle = (name: "crop" | "mask") => setTool(tool === name ? undefined : name);
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
          {redaction && (
            <button onClick={() => toggle("mask")} aria-expanded={tool === "mask"}>
              <EyeOff size={14} />
              Закрасить данные
            </button>
          )}
          <button onClick={() => toggle("crop")} aria-expanded={tool === "crop"}>
            <Crop size={14} />
            Обрезать
          </button>
        </div>
      )}
      {tool === "mask" && update && (
        <MaskControls
          masks={masks}
          onChange={(next) => saveFile(withMasks(file, activePage, next))}
        />
      )}
      {tool === "crop" && update && (
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
                  {index + 1} / {order.length} (в файле {number})
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
      {redaction && (
        <PageCheck
          files={files}
          file={file}
          page={activePage}
          onCheck={update && ((checked) => saveFile(withCheck(file, activePage, checked)))}
        />
      )}
      <ErrorMessage error={error} />
      <div className="media-canvas" ref={area}>
        <div
          className="media-page"
          style={{
            width: width ? width * zoom : "100%",
            clipPath: `inset(${top}% ${right}% ${bottom}% ${left}%)`,
          }}
        >
          <MaskLayer
            masks={masks}
            drawing={tool === "mask" && Boolean(update)}
            onDraw={(mask) => saveFile(withMasks(file, activePage, [...masks, mask]))}
          />
          {focus && focus.fileId === file.id && focus.page === activePage && (
            <FocusBox ref={focusBox} region={focus.region} />
          )}
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

function MediaPlaceholder() {
  return (
    <div className="media-placeholder" role="status">
      <div className="dp-sk media-skeleton" aria-hidden="true" />
      <span>Открываем оригинал…</span>
    </div>
  );
}
