import type { PercentValues } from "./rectPercent";

const fieldNames = ["x", "y", "width", "height"] as const;
const fieldLabels = ["Слева", "Сверху", "Ширина", "Высота"];

export function RectFields({
  values,
  setValues,
  minSize,
}: {
  values: PercentValues;
  setValues: (update: (current: PercentValues) => PercentValues) => void;
  minSize: number;
}) {
  const minPercent = Math.round(minSize * 100);
  return fieldNames.map((key, index) => {
    const isSize = key === "width" || key === "height";
    return (
      <label key={key}>
        {fieldLabels[index]}
        <input
          type="number"
          required
          min={isSize ? minPercent : 0}
          max={isSize ? 100 : 100 - minPercent}
          value={values[key]}
          onChange={(event) => setValues((current) => ({ ...current, [key]: event.target.value }))}
        />
      </label>
    );
  });
}
