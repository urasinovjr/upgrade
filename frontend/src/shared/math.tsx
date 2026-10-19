import { useEffect, useRef } from "react";
import { MathfieldElement, convertLatexToMarkup } from "mathlive";
import "mathlive/fonts.css";
import "mathlive/static.css";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "math-field": React.HTMLAttributes<MathfieldElement> & {
        ref?: React.Ref<MathfieldElement>;
        "aria-label"?: string;
      };
    }
  }
}
MathfieldElement.soundsDirectory = null;
MathfieldElement.fontsDirectory = null;
MathfieldElement.locale = "ru";
let keyboardUsers = 0;
const updateKeyboardInset = () => {
  const height = window.mathVirtualKeyboard.visible
    ? window.mathVirtualKeyboard.boundingRect.height
    : 0;
  const inDialog = window.mathVirtualKeyboard.container !== document.body;
  const root = document.documentElement.style;
  root.setProperty("--keyboard-height", (inDialog ? 0 : height) + "px");
  root.setProperty("--dialog-keyboard-height", (inDialog ? height : 0) + "px");
};
function observeKeyboard() {
  if (keyboardUsers++ === 0) {
    window.mathVirtualKeyboard.addEventListener("geometrychange", updateKeyboardInset);
    updateKeyboardInset();
  }
  return () => {
    if (--keyboardUsers === 0) {
      window.mathVirtualKeyboard.removeEventListener("geometrychange", updateKeyboardInset);
      document.documentElement.style.removeProperty("--keyboard-height");
      document.documentElement.style.removeProperty("--dialog-keyboard-height");
    }
  };
}
export function Formula({ value }: { value: string }) {
  return (
    <span
      className="formula"
      data-latex={value}
      dangerouslySetInnerHTML={{ __html: convertLatexToMarkup(value || "\\text{—}") }}
    />
  );
}
export function FormulaInput({
  value,
  onChange,
  label,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  disabled?: boolean;
}) {
  const ref = useRef<MathfieldElement>(null);
  useEffect(observeKeyboard, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.mathVirtualKeyboardPolicy = "manual";
    element.smartFence = true;
    element.readOnly = disabled;
    if (element.value !== value) element.setValue(value, { silenceNotifications: true });
  }, [value, disabled]);
  return (
    <math-field
      ref={ref}
      aria-label={label}
      onInput={(event) => onChange((event.target as MathfieldElement).value)}
    />
  );
}
