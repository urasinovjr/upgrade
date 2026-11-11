import { RotateCcw } from "lucide-react";
import type { CropRect } from "../domain/models";
import { RectFields } from "./RectFields";
import { rectFromPercent, useRectFields } from "./rectPercent";

export function CropControls({
  crop,
  onApply,
}: {
  crop: CropRect;
  onApply: (crop: CropRect) => void;
}) {
  const [values, setValues] = useRectFields(crop);
  return (
    <form
      className="crop-controls"
      onSubmit={(event) => {
        event.preventDefault();
        onApply(rectFromPercent(values, 0.05));
      }}
    >
      <p>Область для разбора в процентах. Исходный файл не меняется</p>
      <RectFields values={values} setValues={setValues} minSize={0.05} />
      <button type="submit" className="dp-primary">
        Сохранить обрезку
      </button>
      <button type="button" onClick={() => onApply({ x: 0, y: 0, width: 1, height: 1 })}>
        <RotateCcw size={14} />
        Сбросить
      </button>
    </form>
  );
}
