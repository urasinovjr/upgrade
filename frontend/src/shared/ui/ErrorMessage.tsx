import { AlertCircle } from "lucide-react";
import { errorText } from "../text";
import { Callout } from "./Callout";

export function ErrorMessage({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <Callout
      tone="danger"
      role="alert"
      boxed
      icon={<AlertCircle size={16} aria-hidden="true" />}
      title={errorText(error)}
    />
  );
}
