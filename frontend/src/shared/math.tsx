import { useEffect, useRef } from "react";
import { MathfieldElement } from "mathlive";
import { mixedMarkup } from "./mathMarkup";
import { observeFormulaKeyboard } from "./formulaKeyboard";
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
let resetKeyboard: (() => void) | undefined;
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
    resetKeyboard = observeFormulaKeyboard(updateKeyboardInset);
    window.mathVirtualKeyboard.addEventListener("geometrychange", updateKeyboardInset);
    updateKeyboardInset();
  }
  return () => {
    if (--keyboardUsers === 0) {
      resetKeyboard?.();
      resetKeyboard = undefined;
      window.mathVirtualKeyboard.removeEventListener("geometrychange", updateKeyboardInset);
      document.documentElement.style.removeProperty("--keyboard-height");
      document.documentElement.style.removeProperty("--dialog-keyboard-height");
    }
  };
}
export function MixedText({ value, bareMath = false }: { value: string; bareMath?: boolean }) {
  return (
    <span
      className={bareMath ? "formula mixed-text" : "mixed-text"}
      data-latex={value}
      dangerouslySetInnerHTML={{ __html: mixedMarkup(value || (bareMath ? "—" : ""), bareMath) }}
    />
  );
}
export function Formula({ value }: { value: string }) {
  return <MixedText value={value} bareMath />;
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
    const useNativeTab = (event: KeyboardEvent) => {
      if (event.key === "Tab") event.stopImmediatePropagation();
    };
    element.addEventListener("keydown", useNativeTab, true);
    return () => element.removeEventListener("keydown", useNativeTab, true);
  }, []);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    element.mathVirtualKeyboardPolicy = "manual";
    element.smartFence = true;
    element.disabled = disabled;
    element.readOnly = disabled;
    element.setAttribute("role", "group");
    element.removeAttribute("contenteditable");
    element.removeAttribute("tabindex");
    const input = element.shadowRoot?.querySelector<HTMLElement>('[part="keyboard-sink"]');
    if (input) {
      input.setAttribute("aria-label", label);
      input.setAttribute("aria-disabled", String(disabled));
      input.contentEditable = String(!disabled);
      input.tabIndex = disabled ? -1 : 0;
    }
  }, [disabled, label]);
  useEffect(() => {
    const element = ref.current;
    if (element && element.value !== value) element.setValue(value, { silenceNotifications: true });
  }, [value]);
  return (
    <math-field
      ref={ref}
      aria-label={label}
      onInput={(event) => onChange((event.target as MathfieldElement).value)}
    />
  );
}
