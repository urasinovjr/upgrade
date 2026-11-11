export type TextPart = { kind: "text" | "math" | "invalid"; value: string };

function legacyParts(value: string, bareMath: boolean): TextPart[] {
  if (!bareMath) return [{ kind: "text", value }];
  if (!/[а-яё]/i.test(value))
    return [{ kind: /[=^_\\+*/<>±√]|\d|^[a-z]$/i.test(value) ? "math" : "text", value }];
  const parts: TextPart[] = [];
  const fragments = /[a-z0-9\\{}_^=+*/().,;<>|[\]:! \t−±√∞∠°-]+/gi;
  let end = 0;
  for (const match of value.matchAll(fragments)) {
    if (match.index > end) parts.push({ kind: "text", value: value.slice(end, match.index) });
    const trimmed = match[0].trim();
    if (trimmed && /[=^_\\+*/<>±√]|\d/.test(trimmed)) {
      const leading = match[0].length - match[0].trimStart().length;
      const trailing = match[0].length - match[0].trimEnd().length;
      if (leading) parts.push({ kind: "text", value: match[0].slice(0, leading) });
      parts.push({ kind: "math", value: trimmed });
      if (trailing) parts.push({ kind: "text", value: match[0].slice(-trailing) });
    } else parts.push({ kind: "text", value: match[0] });
    end = match.index + match[0].length;
  }
  if (end < value.length) parts.push({ kind: "text", value: value.slice(end) });
  return parts;
}

export function mixedTextParts(value: string, bareMath = true): TextPart[] {
  const parts: TextPart[] = [];
  const explicit = /(?<!\\)\$|\\\(/.test(value);
  let start = 0;
  let index = 0;
  let braceDepth = 0;
  const plain = (end: number) => {
    if (end > start) parts.push(...legacyParts(value.slice(start, end), bareMath && !explicit));
  };
  while (index < value.length) {
    const dollar = value[index] === "$" && value[index - 1] !== "\\";
    const parenthesis = value.startsWith("\\(", index);
    if (dollar || parenthesis) {
      const delimiter = dollar ? "$" : "\\)";
      const offset = dollar ? 1 : 2;
      let end = value.indexOf(delimiter, index + offset);
      while (end >= 0 && dollar && value[end - 1] === "\\") end = value.indexOf(delimiter, end + 1);
      if (end >= 0) {
        plain(index);
        parts.push({ kind: "math", value: value.slice(index + offset, end) });
        index = end + offset;
        start = index;
        continue;
      }
      plain(index);
      parts.push({ kind: "invalid", value: value.slice(index) });
      return parts;
    }
    if (braceDepth === 0 && value.startsWith("\\text{", index)) {
      let end = index + 6;
      let depth = 1;
      while (end < value.length && depth > 0) {
        if (value[end - 1] !== "\\") {
          if (value[end] === "{") depth++;
          if (value[end] === "}") depth--;
        }
        end++;
      }
      if (depth === 0) {
        plain(index);
        parts.push({ kind: "text", value: value.slice(index + 6, end - 1) });
        index = end;
        start = index;
        continue;
      }
    }
    if (value[index - 1] !== "\\") {
      if (value[index] === "{") braceDepth++;
      if (value[index] === "}") braceDepth = Math.max(0, braceDepth - 1);
    }
    index++;
  }
  plain(value.length);
  return parts;
}
