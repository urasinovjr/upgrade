import { useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { defaultLayout, sameLayout, type DashboardLayout } from "../../domain/dashboardLayout";
import { useSaveLayout } from "../../shared/query";

export function useLayoutEditor(saved: DashboardLayout) {
  const save = useSaveLayout();
  const [draft, setDraft] = useState<DashboardLayout>();
  const editing = draft !== undefined;
  const dirty = editing && !sameLayout(draft, saved);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload((event) => {
    if (dirty) {
      event.preventDefault();
      event.returnValue = "";
    }
  });
  const commit = async () => {
    if (!draft) return;
    if (dirty) await save.mutateAsync(draft);
    setDraft(undefined);
  };
  return {
    editing,
    dirty,
    layout: draft ?? saved,
    saving: save.isPending,
    error: save.error,
    blocker,
    start: () => {
      save.reset();
      setDraft(saved);
    },
    cancel: () => setDraft(undefined),
    reset: () => setDraft(defaultLayout()),
    apply: (change: (layout: DashboardLayout) => DashboardLayout) =>
      setDraft((current) => current && change(current)),
    commit,
  };
}
export type LayoutEditor = ReturnType<typeof useLayoutEditor>;
