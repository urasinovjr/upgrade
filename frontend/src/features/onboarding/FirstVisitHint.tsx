import { useId } from "react";
import { PencilLine } from "lucide-react";
import { hintSeen, withHintSeen, type HintId } from "../../domain/onboarding";
import { useOnboarding, useSaveOnboarding } from "../../shared/query";
import { hints } from "./hints";
import "./onboarding.css";

export function FirstVisitHint({ id }: { id: HintId }) {
  const titleId = useId();
  const onboarding = useOnboarding();
  const save = useSaveOnboarding();
  const current = onboarding.data;
  if (!current || hintSeen(current, id)) return null;
  const hint = hints[id];
  return (
    <aside className="dp-hint" aria-labelledby={titleId} data-hint={id}>
      <PencilLine size={16} aria-hidden="true" />
      <strong id={titleId} className="dp-hint-title">
        {hint.title}
      </strong>
      <p className="dp-hint-text">{hint.text}</p>
      <button onClick={() => save.mutate(withHintSeen(current, id))}>Понятно</button>
    </aside>
  );
}
