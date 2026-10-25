export interface NodeBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MapLink {
  from: string;
  to: string;
}

export const mapLinks: MapLink[] = [
  { from: "fractions", to: "domain" },
  { from: "powers", to: "domain" },
  { from: "domain", to: "roots" },
  { from: "domain", to: "logs" },
];

export function linkPath(from: NodeBox, to: NodeBox) {
  const startX = from.x + from.width;
  const startY = from.y + from.height / 2;
  const endX = to.x;
  const endY = to.y + to.height / 2;
  const bend = (endX - startX) / 2;
  return `M${startX} ${startY} C${startX + bend} ${startY} ${endX - bend} ${endY} ${endX} ${endY}`;
}

export function touches(link: MapLink, node: string | null) {
  return node !== null && (link.from === node || link.to === node);
}
