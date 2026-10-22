import { request, requestBlob } from "./api";

export interface SentPage {
  index: number;
  fileId: string;
  page: number;
  contentType: string;
  width: number;
  height: number;
  sha256: string;
}

export function sentPages(workId: string) {
  return request<SentPage[]>("/works/" + workId + "/analysis/pages");
}

export function sentPageImage(workId: string, index: number) {
  return requestBlob("/works/" + workId + "/analysis/pages/" + index);
}
