import type { WorkStatus } from "../../domain/models";
import { statusMeta } from "../status";

export function Badge({ status }: { status: WorkStatus }) {
  const { label, tone, Icon } = statusMeta[status];
  return (
    <span className={"dp-badge dp-tone-" + tone}>
      <Icon size={12} aria-hidden="true" />
      {label}
    </span>
  );
}
