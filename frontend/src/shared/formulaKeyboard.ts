import type {
  VirtualKeyboardKeycap,
  VirtualKeyboardLayout,
  NormalizedVirtualKeyboardLayout,
} from "mathlive";

type Key = Partial<VirtualKeyboardKeycap>;

function keys(layouts: NormalizedVirtualKeyboardLayout[]) {
  return layouts
    .flatMap((layout) => layout.layers.flatMap((layer) => layer.rows?.flat() ?? []))
    .filter((key) => !/separator|horizontal-rule/.test(key.class ?? ""))
    .map((key) => ({ ...key, width: 1 as const }));
}

function pages(id: string, label: string, values: Key[]): VirtualKeyboardLayout {
  const pageCount = Math.ceil(values.length / 15);
  const layers = Array.from({ length: pageCount }, (_, page) => {
    const items = values.slice(page * 15, (page + 1) * 15);
    const rows: (Key | string)[][] = [];
    for (let offset = 0; offset < items.length; offset += 5)
      rows.push(items.slice(offset, offset + 5));
    rows.push([
      {
        label: "‹",
        tooltip: "Предыдущая страница",
        command: ["switchKeyboardLayer", `${id}-${(page + pageCount - 1) % pageCount}`],
      },
      {
        label: `${page + 1}/${pageCount}`,
        tooltip: "Следующая страница",
        command: ["switchKeyboardLayer", `${id}-${(page + 1) % pageCount}`],
      },
      "[shift]",
      "[backspace]",
      "[hide-keyboard]",
    ]);
    return { id: `${id}-${page}`, rows };
  });
  return { label, displayEditToolbar: false, layers };
}

export function compactLayouts(
  defaults: NormalizedVirtualKeyboardLayout[],
): VirtualKeyboardLayout[] {
  const numeric = keys(defaults.slice(0, 1));
  const digit = (label: string) =>
    numeric.find((key) => key.latex === label || key.label === label) ?? { latex: label };
  return [
    {
      label: "Цифры",
      displayEditToolbar: false,
      rows: [
        [digit("7"), digit("8"), digit("9"), "[/]", "[backspace]"],
        [digit("4"), digit("5"), digit("6"), "[*]", digit("x")],
        [digit("1"), digit("2"), digit("3"), "[-]", "[=]"],
        [digit("0"), "[.]", "[(]", "[)]", "[+]"],
      ],
    },
    pages("formulas", "Формулы", [
      ...numeric,
      ...keys(defaults.slice(1, 2)),
      { label: "[undo]" },
      { label: "[redo]" },
      { label: "[cut]" },
      { label: "[copy]" },
      { label: "[paste]" },
    ]),
    pages("letters", "Буквы", keys(defaults.slice(2))),
  ];
}

export function observeFormulaKeyboard(updateInset: () => void) {
  const keyboard = window.mathVirtualKeyboard;
  const previous = keyboard.layouts;
  const defaults = keyboard.normalizedLayouts;
  const compact = compactLayouts(defaults);
  const media = window.matchMedia("(max-width: 700px)");
  const update = () => {
    const visible = keyboard.visible;
    keyboard.layouts = media.matches ? compact : previous;
    if (visible) keyboard.show();
    updateInset();
  };
  media.addEventListener("change", update);
  update();
  return () => {
    media.removeEventListener("change", update);
    keyboard.hide();
    keyboard.layouts = previous;
  };
}
