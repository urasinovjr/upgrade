export interface Point {
  x: number;
  y: number;
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function sweptAngle(points: Point[], center: Point) {
  let total = 0;
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    const from = Math.atan2(previous.y - center.y, previous.x - center.x);
    const to = Math.atan2(current.y - center.y, current.x - center.x);
    let delta = to - from;
    if (delta > Math.PI) delta -= Math.PI * 2;
    if (delta < -Math.PI) delta += Math.PI * 2;
    total += delta;
  }
  return Math.abs(total);
}

export function coverage(points: Point[], box: Box) {
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const overlapWidth =
    Math.min(Math.max(...xs), box.x + box.width) - Math.max(Math.min(...xs), box.x);
  const overlapHeight =
    Math.min(Math.max(...ys), box.y + box.height) - Math.max(Math.min(...ys), box.y);
  if (overlapWidth <= 0 || overlapHeight <= 0) return 0;
  return (overlapWidth * overlapHeight) / (box.width * box.height);
}

export function isCircled(points: Point[], box: Box) {
  if (points.length < 8) return false;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  return coverage(points, box) >= 0.6 && sweptAngle(points, center) >= Math.PI * 1.6;
}

export function strokePath(points: Point[]) {
  if (points.length === 0) return "";
  const [first, ...rest] = points;
  let path = `M${first.x.toFixed(1)} ${first.y.toFixed(1)}`;
  rest.forEach((point, index) => {
    const next = rest[index + 1] ?? point;
    const midX = (point.x + next.x) / 2;
    const midY = (point.y + next.y) / 2;
    path += ` Q${point.x.toFixed(1)} ${point.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  });
  return path;
}
