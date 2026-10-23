import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { StudentGap } from "../../domain/models";
import { mapNode } from "../../domain/knowledgeLayout";
import { topics } from "../../data/fixtures";
import { graph, reducedMotion, statusOf, topicStatus, type TopicState } from "./knowledge";

const nodeStateClass: Record<TopicState, string> = {
  open: "is-gap-open",
  closed: "is-gap-closed",
  none: "is-no-data",
};

export function KnowledgeMap({
  gaps,
  selected,
  onSelect,
}: {
  gaps: StudentGap[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const [edges, setEdges] = useState({ start: true, end: true });
  const path = new Set<string>();
  const visit = (id: string) =>
    topics
      .find((topic) => topic.id === id)
      ?.prerequisites.forEach((parent) => {
        if (!path.has(parent)) {
          path.add(parent);
          visit(parent);
        }
      });
  visit(selected);
  const updateFade = useCallback(() => {
    const element = scroller.current;
    if (!element) return;
    const start = element.scrollLeft <= 2;
    const end = element.scrollLeft + element.clientWidth >= element.scrollWidth - 2;
    setEdges((previous) =>
      previous.start === start && previous.end === end ? previous : { start, end },
    );
  }, []);
  useEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const observer = new ResizeObserver(updateFade);
    observer.observe(element);
    return () => observer.disconnect();
  }, [updateFade]);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element) return;
    const node = graph.nodes[selected];
    const scale = element.scrollWidth / graph.width;
    const left = node.x * scale;
    const right = (node.x + mapNode.width) * scale;
    if (left < element.scrollLeft || right > element.scrollLeft + element.clientWidth)
      element.scrollLeft = left - (element.clientWidth - (right - left)) / 2;
    updateFade();
  }, [selected, updateFade]);
  const scrollBy = (direction: number) =>
    scroller.current?.scrollBy({
      left: direction * 200,
      behavior: reducedMotion() ? "auto" : "smooth",
    });
  return (
    <div className="dp-map-frame" data-scroll-start={edges.start} data-scroll-end={edges.end}>
      <div
        ref={scroller}
        className="dp-map-scroll"
        tabIndex={0}
        aria-label="Карта связей тем. На узком экране прокручивается по горизонтали."
        onScroll={updateFade}
      >
        <svg
          viewBox={`0 0 ${graph.width} ${graph.height}`}
          style={{ "--ug-map-width": graph.width + "px" } as CSSProperties}
          role="group"
          aria-label="Карта знаний по алгебре"
        >
          <defs>
            {(["dp-map-arrow", "dp-map-arrow-path"] as const).map((id) => (
              <marker
                key={id}
                id={id}
                className={id}
                viewBox="0 0 8 8"
                markerWidth="8"
                markerHeight="8"
                refX="7"
                refY="4"
                orient="auto"
                markerUnits="userSpaceOnUse"
              >
                <path d="M1 1L7 4L1 7" fill="none" strokeWidth="1.5" />
              </marker>
            ))}
          </defs>
          {graph.edges
            .map((edge) => ({
              ...edge,
              onPath: (edge.to === selected || path.has(edge.to)) && path.has(edge.from),
            }))
            .sort((a, b) => Number(a.onPath) - Number(b.onPath))
            .map((edge) => (
              <path
                key={edge.from + edge.to}
                pathLength={1}
                className={"dp-map-edge" + (edge.onPath ? " is-path" : "")}
                d={edge.d}
                fill="none"
                markerEnd={edge.onPath ? "url(#dp-map-arrow-path)" : "url(#dp-map-arrow)"}
              />
            ))}
          {topics.map((topic) => {
            const { x, y, lines } = graph.nodes[topic.id];
            const status = statusOf(gaps.find((item) => item.topicId === topic.id));
            const blockTop = y + (mapNode.height - (lines.length * 18 + 20)) / 2;
            const className = [
              "dp-map-node",
              "dp-tone-" + status.tone,
              selected === topic.id && "selected",
              path.has(topic.id) && "is-prerequisite",
              nodeStateClass[status.key],
            ]
              .filter(Boolean)
              .join(" ");
            return (
              <g
                key={topic.id}
                className={className}
                role="button"
                tabIndex={0}
                aria-pressed={selected === topic.id}
                aria-label={topic.name + " · " + status.label}
                onClick={() => onSelect(topic.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelect(topic.id);
                  }
                }}
              >
                <rect
                  className="dp-map-focus"
                  x={x - 4}
                  y={y - 4}
                  width={mapNode.width + 8}
                  height={mapNode.height + 8}
                  rx={12}
                />
                <rect
                  className="dp-map-box"
                  x={x}
                  y={y}
                  width={mapNode.width}
                  height={mapNode.height}
                  rx={8}
                />
                {lines.map((line, index) => (
                  <text key={line} x={x + 12} y={blockTop + 14 + index * 18} fontSize="14">
                    {line}
                  </text>
                ))}
                <status.Icon
                  className="dp-map-status-icon"
                  x={x + 12}
                  y={blockTop + lines.length * 18 + 5}
                  size={14}
                  aria-hidden="true"
                />
                <text
                  className="dp-map-status"
                  x={x + 32}
                  y={blockTop + lines.length * 18 + 16}
                  fontSize="12"
                >
                  {status.label}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <button
        type="button"
        className="dp-map-more is-start"
        tabIndex={-1}
        aria-label="Прокрутить карту влево"
        onClick={() => scrollBy(-1)}
      >
        <ChevronLeft size={16} />
      </button>
      <button
        type="button"
        className="dp-map-more is-end"
        tabIndex={-1}
        aria-label="Прокрутить карту вправо"
        onClick={() => scrollBy(1)}
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export function MapLegend() {
  return (
    <ul className="dp-map-legend" aria-label="Обозначения карты">
      {(["none", "open", "closed"] as const).map((key) => {
        const { label, tone, Icon } = topicStatus[key];
        return (
          <li key={key} className={"dp-tone-" + tone}>
            <Icon size={14} aria-hidden="true" />
            {label}
          </li>
        );
      })}
      <li className="dp-map-legend-selected">
        <span aria-hidden="true" />
        Выбранная тема
      </li>
      <li className="dp-map-legend-path">
        <span aria-hidden="true" />
        Ведёт к выбранной теме
      </li>
    </ul>
  );
}
