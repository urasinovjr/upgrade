import { useLayoutEffect, useRef, useState } from "react";
import { InkStroke } from "../../shared/ui/InkStroke";
import { useReveal } from "../../shared/ui/useInView";
import { linkPath, mapLinks, touches } from "./mapGeometry";

interface DrawnLink {
  key: string;
  path: string;
  active: boolean;
}

function measure(container: HTMLElement) {
  const origin = container.getBoundingClientRect();
  const boxes = new Map<string, DOMRect>();
  container.querySelectorAll<HTMLElement>("[data-node]").forEach((node) => {
    boxes.set(node.dataset.node ?? "", node.getBoundingClientRect());
  });
  const paths = new Map<string, string>();
  for (const link of mapLinks) {
    const from = boxes.get(link.from);
    const to = boxes.get(link.to);
    if (!from || !to) continue;
    const shift = (box: DOMRect) => ({
      x: box.left - origin.left,
      y: box.top - origin.top,
      width: box.width,
      height: box.height,
    });
    paths.set(link.from + "-" + link.to, linkPath(shift(from), shift(to)));
  }
  return paths;
}

export function MapLinks({ active }: { active: string | null }) {
  const svgRef = useRef<SVGSVGElement>(null);
  const drawn = useReveal(svgRef, 0.3);
  const [paths, setPaths] = useState(new Map<string, string>());

  useLayoutEffect(() => {
    const element = svgRef.current?.parentElement;
    if (!element) return;
    const update = () => setPaths(measure(element));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    document.fonts?.ready.then(update);
    return () => observer.disconnect();
  }, []);

  const links: DrawnLink[] = mapLinks.flatMap((link) => {
    const key = link.from + "-" + link.to;
    const path = paths.get(key);
    return path ? [{ key, path, active: touches(link, active) }] : [];
  });

  return (
    <svg ref={svgRef} className="dp-landing-map-links" aria-hidden="true">
      {links.map((link, index) => (
        <g key={link.key} data-active={link.active}>
          <InkStroke d={link.path} drawn={drawn} tone="pencil" dashed delay={index * 120} />
          <InkStroke d={link.path} drawn={drawn && link.active} tone="ink" />
        </g>
      ))}
    </svg>
  );
}
