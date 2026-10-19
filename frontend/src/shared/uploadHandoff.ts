import type { Upload } from "../domain/models";

let pending: { token: string; uploads: Upload[] } | undefined;

export function stageUploads(uploads: Upload[]): string {
  const token = crypto.randomUUID();
  pending = { token, uploads };
  return token;
}

export function readStagedUploads(token: string): Upload[] | undefined {
  return pending?.token === token ? [...pending.uploads] : undefined;
}

export function clearStagedUploads(token: string): void {
  if (pending?.token === token) pending = undefined;
}
