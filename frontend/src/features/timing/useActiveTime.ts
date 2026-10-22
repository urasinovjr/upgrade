import { useEffect } from "react";
import type { TimingStage } from "../../domain/activeTime";
import { enterPlace } from "./tracker";

export function useActiveTime(stage: TimingStage | undefined, workId?: string) {
  useEffect(() => (stage ? enterPlace(stage, workId) : undefined), [stage, workId]);
}
