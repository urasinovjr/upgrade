import { useEffect } from "react";
import type { TimingStage } from "../../domain/activeTime";
import { enterPlace } from "./tracker";

export function useActiveTime(
  stage: TimingStage | undefined,
  workId?: string,
  homeworkId?: string,
) {
  useEffect(
    () => (stage ? enterPlace(stage, workId, homeworkId) : undefined),
    [stage, workId, homeworkId],
  );
}
