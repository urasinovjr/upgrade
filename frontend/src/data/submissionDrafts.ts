import { openDB } from "idb";
import type { Submission } from "../domain/homework";
import type { Upload } from "../domain/models";

export interface SubmissionDraft extends Submission {
  uploads: Upload[];
}
async function database() {
  return openDB("upgrade-submission-drafts", 1, {
    upgrade(db) {
      db.createObjectStore("drafts");
    },
  });
}
export async function readSubmissionDraft(id: string): Promise<SubmissionDraft> {
  const db = await database();
  const draft = await db.get("drafts", id);
  db.close();
  if (!draft) return { id: crypto.randomUUID(), taskFiles: {}, uploads: [] };
  return {
    ...draft,
    uploads: draft.uploads.map(({ bytes, ...upload }: Upload & { bytes: Uint8Array }) => ({
      ...upload,
      blob: new Blob([new Uint8Array(bytes)], { type: upload.type }),
    })),
  };
}
export async function saveSubmissionDraft(id: string, draft: SubmissionDraft) {
  const uploads = await Promise.all(
    draft.uploads.map(async ({ blob, ...upload }) => ({
      ...upload,
      bytes: new Uint8Array(await blob.arrayBuffer()),
    })),
  );
  const db = await database();
  await db.put("drafts", { ...draft, uploads }, id);
  db.close();
}
export async function clearSubmissionDraft(id: string) {
  const db = await database();
  await db.delete("drafts", id);
  db.close();
}
