import { useEffect, useRef, useState } from "react";
import { useBeforeUnload, useBlocker } from "react-router";
import { useQueryClient } from "@tanstack/react-query";
import { gateway } from "../../data/gateway";
import { useWriteAccess } from "../../shared/session";
import type { Attachment, Draft, Work } from "../../domain/models";
import { applyDraft, currentRevision, inputSignature, reviewBlockers } from "../../domain/review";

export type ReviewAction = "analyse" | "manual" | "confirm" | "edit" | "withdraw";
export type SaveState = "saving" | "dirty" | "saved";

export function useReviewDraft(work: Work) {
  const writeAccess = useWriteAccess();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() =>
    structuredClone(work.editing ? work.draft : currentRevision(work)?.draft || work.draft),
  );
  const latest = useRef(draft);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const chain = useRef<Promise<void>>(Promise.resolve());
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const [needsRecheck, setNeedsRecheck] = useState(
    work.draft.inputRevision !== work.draft.analysedInputRevision,
  );
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
  const wasProcessing = useRef(Boolean(work.job));
  useEffect(() => {
    if (wasProcessing.current && !work.job) {
      latest.current = structuredClone(work.draft);
      setDraft(latest.current);
      setNeedsRecheck(work.draft.inputRevision !== work.draft.analysedInputRevision);
    }
    wasProcessing.current = Boolean(work.job);
  }, [work.job, work.draft]);
  useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  const replaceDraft = (next: Draft) => {
    latest.current = next;
    setDraft(next);
  };
  const save = async () => {
    clearTimeout(timer.current);
    const snapshot = latest.current;
    setSaving(true);
    const pending = chain.current.catch(() => {}).then(() => gateway.draft(work.id, snapshot));
    chain.current = pending;
    try {
      await pending;
      if (latest.current === snapshot) setDirty(false);
      setError(undefined);
    } catch (cause) {
      setError(cause);
      throw cause;
    } finally {
      setSaving(false);
    }
  };
  const change = (next: Draft) => {
    const changed = inputSignature(latest.current) !== inputSignature(next);
    const adjusted = applyDraft({ ...work, job: undefined, draft: latest.current }, next).draft;
    if (changed) setNeedsRecheck(true);
    replaceDraft(adjusted);
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void save().catch(() => {});
    }, 450);
  };
  const run = async (command: () => Promise<void>, recheck?: boolean) => {
    if (busy) return false;
    setBusy(true);
    setError(undefined);
    try {
      if (work.editing && !work.job) await save();
      await command();
      if (recheck) setNeedsRecheck(true);
      const state = await gateway.read();
      client.setQueryData(["store"], state);
      const updated = state.works.find((item) => item.id === work.id)!;
      if (updated.editing) {
        replaceDraft(structuredClone(updated.draft));
        setNeedsRecheck(updated.draft.inputRevision !== updated.draft.analysedInputRevision);
      }
      return true;
    } catch (cause) {
      setError(cause);
      return false;
    } finally {
      setBusy(false);
    }
  };
  const action = (kind: ReviewAction) => run(() => gateway.action(work.id, kind));
  const updateAttachments = (files: Attachment[]) =>
    void run(() => gateway.attachments(work.id, files), true);

  const effective: Work = {
    ...work,
    draft: { ...draft, inputRevision: needsRecheck ? 1 : 0, analysedInputRevision: 0 },
  };
  const saveState: SaveState = saving ? "saving" : dirty ? "dirty" : "saved";
  return {
    draft,
    change,
    save,
    saveState,
    dirty,
    saving,
    busy: busy || !writeAccess.allowed,
    error,
    action,
    updateAttachments,
    needsRecheck,
    effective,
    blockers: reviewBlockers(effective),
    canEdit: work.editing && !work.job && !busy && writeAccess.allowed,
    blocker,
  };
}
