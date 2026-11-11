import { convertLatexToMarkup } from "mathlive";
import { mixedTextParts } from "./mixedText";

function escapeText(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
  );
}

export function mathMarkup(value: string) {
  try {
    const markup = convertLatexToMarkup(value);
    if (/ML__error/.test(markup)) return null;
    return markup;
  } catch {
    return null;
  }
}

export function mixedMarkup(value: string, bareMath = true) {
  return mixedTextParts(value, bareMath)
    .map((part) => {
      if (part.kind === "text") return escapeText(part.value);
      const markup = part.kind === "invalid" ? null : mathMarkup(part.value);
      return markup === null
        ? '<span class="formula-error">Не удалось отобразить формулу: ' +
            escapeText(part.value) +
            "</span>"
        : '<span class="formula-part">' + markup + "</span>";
    })
    .join("");
}
