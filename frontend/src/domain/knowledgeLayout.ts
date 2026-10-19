export type LayoutTopic = { id: string; name: string; prerequisites: string[] };
export type MapNode = { id: string; x: number; y: number; lines: string[] };
export type MapEdge = { from: string; to: string; d: string };
export type MapLayout = {
  width: number;
  height: number;
  nodes: Record<string, MapNode>;
  edges: MapEdge[];
  crossings: number;
};

export const mapNode = { width: 184, height: 68 };
const columnGap = 32;
const rowGap = 64;
const margin = 16;
const portStep = 14;
const maxCombinations = 50_000;

export function wrapName(name: string, limit = 18): string[] {
  const lines: string[] = [];
  for (const word of name.split(" ")) {
    const last = lines.at(-1);
    if (last !== undefined && (last + " " + word).length <= limit)
      lines[lines.length - 1] += " " + word;
    else lines.push(word);
  }
  return lines.length > 2 ? [lines[0], lines.slice(1).join(" ")] : lines;
}

type Vertex = { id: string; dummy: boolean; layer: number };

function permutations<T>(items: T[]): T[][] {
  if (items.length <= 1) return [items];
  return items.flatMap((item, index) =>
    permutations([...items.slice(0, index), ...items.slice(index + 1)]).map((rest) => [
      item,
      ...rest,
    ]),
  );
}

function fitRow(desired: number[], separations: number[]): number[] {
  const offsets = desired.map((_, index) =>
    separations.slice(0, index).reduce((sum, value) => sum + value, 0),
  );
  const blocks: { value: number; count: number }[] = [];
  desired.forEach((value, index) => {
    blocks.push({ value: value - offsets[index], count: 1 });
    while (blocks.length > 1 && blocks.at(-2)!.value > blocks.at(-1)!.value) {
      const last = blocks.pop()!;
      const previous = blocks.at(-1)!;
      previous.value =
        (previous.value * previous.count + last.value * last.count) / (previous.count + last.count);
      previous.count += last.count;
    }
  });
  const fitted = blocks.flatMap((block) => Array<number>(block.count).fill(block.value));
  return fitted.map((value, index) => value + offsets[index]);
}

export function layoutKnowledgeMap(topics: LayoutTopic[]): MapLayout {
  const byId = new Map(topics.map((topic) => [topic.id, topic]));
  const layerOf = new Map<string, number>();
  const layer = (id: string): number => {
    if (!layerOf.has(id)) {
      const parents = byId.get(id)?.prerequisites.filter((parent) => byId.has(parent)) ?? [];
      layerOf.set(id, parents.length ? Math.max(...parents.map(layer)) + 1 : 0);
    }
    return layerOf.get(id)!;
  };
  topics.forEach((topic) => layer(topic.id));

  const vertices = new Map<string, Vertex>(
    topics.map((topic) => [topic.id, { id: topic.id, dummy: false, layer: layer(topic.id) }]),
  );
  const chains = topics.flatMap((topic) =>
    topic.prerequisites
      .filter((parent) => byId.has(parent))
      .map((parent) => {
        const chain = [parent];
        for (let row = layer(parent) + 1; row < layer(topic.id); row++) {
          const id = `${parent}>${topic.id}@${row}`;
          vertices.set(id, { id, dummy: true, layer: row });
          chain.push(id);
        }
        chain.push(topic.id);
        return { from: parent, to: topic.id, chain };
      }),
  );
  const segments = chains.flatMap(({ chain }) =>
    chain.slice(1).map((to, index) => ({ from: chain[index], to })),
  );
  const outgoing = (id: string) =>
    segments.filter((segment) => segment.from === id).map((segment) => segment.to);
  const incoming = (id: string) =>
    segments.filter((segment) => segment.to === id).map((segment) => segment.from);
  const rowCount = Math.max(0, ...[...vertices.values()].map((vertex) => vertex.layer + 1));
  const rows = Array.from({ length: rowCount }, (_, row) =>
    [...vertices.values()].filter((vertex) => vertex.layer === row).map((vertex) => vertex.id),
  );
  const widthOf = (id: string) => (vertices.get(id)!.dummy ? 0 : mapNode.width);
  const separation = (a: string, b: string) => (widthOf(a) + widthOf(b)) / 2 + columnGap;
  const rowWidth = (row: string[]) =>
    row.reduce((sum, id, index) => sum + widthOf(id) + (index ? columnGap : 0), 0);

  const place = (order: string[][]) => {
    const x = new Map<string, number>();
    const anchor = order.reduce(
      (best, row, index) => (rowWidth(row) > rowWidth(order[best]) ? index : best),
      0,
    );
    let cursor = 0;
    order[anchor].forEach((id, index) => {
      if (index) cursor += separation(order[anchor][index - 1], id);
      x.set(id, cursor);
    });
    const placeRow = (row: string[], neighbours: (id: string) => string[]) => {
      const separations = row.slice(1).map((id, index) => separation(row[index], id));
      const desired: number[] = [];
      row.forEach((id, index) => {
        const placed = neighbours(id).filter((other) => x.has(other));
        if (placed.length)
          desired.push(placed.reduce((sum, other) => sum + x.get(other)!, 0) / placed.length);
        else if (index) desired.push(desired[index - 1] + separations[index - 1]);
        else desired.push(0);
      });
      fitRow(desired, separations).forEach((value, index) => x.set(row[index], value));
    };
    for (let row = anchor - 1; row >= 0; row--) placeRow(order[row], outgoing);
    for (let row = anchor + 1; row < order.length; row++) placeRow(order[row], incoming);
    return x;
  };
  const score = (order: string[][]) => {
    const position = new Map(order.flatMap((row) => row.map((id, index) => [id, index] as const)));
    let crossings = 0;
    for (let a = 0; a < segments.length; a++)
      for (let b = a + 1; b < segments.length; b++) {
        const [s, t] = [segments[a], segments[b]];
        if (vertices.get(s.from)!.layer !== vertices.get(t.from)!.layer) continue;
        const top = position.get(s.from)! - position.get(t.from)!;
        const bottom = position.get(s.to)! - position.get(t.to)!;
        if (top * bottom < 0) crossings++;
      }
    const x = place(order);
    const length = segments.reduce(
      (sum, segment) => sum + Math.abs(x.get(segment.from)! - x.get(segment.to)!),
      0,
    );
    return { crossings, length, x };
  };

  const options = rows.map((row) => (row.length <= 6 ? permutations(row) : [row]));
  const total = options.reduce((product, list) => product * list.length, 1);
  let best = { order: rows, ...score(rows) };
  if (total <= maxCombinations) {
    const visit = (index: number, order: string[][]) => {
      if (index === options.length) {
        const candidate = score(order);
        if (
          candidate.crossings < best.crossings ||
          (candidate.crossings === best.crossings && candidate.length < best.length - 0.5)
        )
          best = { order, ...candidate };
        return;
      }
      for (const row of options[index]) visit(index + 1, [...order, row]);
    };
    visit(0, []);
  }

  const xs = [...best.x.entries()];
  const left = Math.min(...xs.map(([id, value]) => value - widthOf(id) / 2));
  const right = Math.max(...xs.map(([id, value]) => value + widthOf(id) / 2));
  const cx = (id: string) => best.x.get(id)! - left + margin;
  const top = (row: number) => margin + row * (mapNode.height + rowGap);

  const nodes: Record<string, MapNode> = {};
  for (const topic of topics) {
    nodes[topic.id] = {
      id: topic.id,
      x: cx(topic.id) - mapNode.width / 2,
      y: top(layer(topic.id)),
      lines: wrapName(topic.name),
    };
  }
  const port = (id: string, others: string[], other: string) => {
    const sorted = [...others].sort((a, b) => cx(a) - cx(b));
    return cx(id) + (sorted.indexOf(other) - (sorted.length - 1) / 2) * portStep;
  };
  const bend = rowGap / 2;
  const edges = chains.map(({ from, to, chain }) => {
    let d = "";
    let previous: [number, number] | null = null;
    const curveTo = (x: number, y: number) => {
      d += previous
        ? ` C${previous[0]},${previous[1] + bend} ${x},${y - bend} ${x},${y}`
        : `M${x},${y}`;
      previous = [x, y];
    };
    chain.forEach((id, index) => {
      const vertex = vertices.get(id)!;
      const rowTop = top(vertex.layer);
      if (vertex.dummy) {
        curveTo(cx(id), rowTop);
        d += ` L${cx(id)},${rowTop + mapNode.height}`;
        previous = [cx(id), rowTop + mapNode.height];
      } else if (index === 0) {
        curveTo(port(id, outgoing(id), chain[1]), rowTop + mapNode.height);
      } else {
        curveTo(port(id, incoming(id), chain[index - 1]), rowTop - 3);
      }
    });
    return { from, to, d };
  });

  return {
    width: right - left + margin * 2,
    height: top(rowCount - 1) + mapNode.height + margin,
    nodes,
    edges,
    crossings: best.crossings,
  };
}
