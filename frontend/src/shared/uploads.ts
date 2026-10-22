import type { Upload } from "../domain/models";

export async function decodeUpload(file: File): Promise<Upload> {
  if (!["image/jpeg", "image/png", "application/pdf"].includes(file.type))
    throw new Error(file.name + ": поддерживаются JPG, PNG и PDF.");
  if (file.size > 20 * 1024 * 1024) throw new Error(file.name + ": максимальный размер — 20 МБ.");
  let pages = 1;
  if (file.type === "application/pdf") {
    const module = await import("./PdfPage");
    try {
      pages = await module.pdfPageCount(file);
    } catch {
      throw new Error(file.name + ": не удалось прочитать PDF. Проверьте файл.");
    }
  } else {
    const url = URL.createObjectURL(file);
    try {
      await new Promise<void>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve();
        image.onerror = () => reject(new Error(file.name + ": изображение повреждено."));
        image.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  return {
    id: crypto.randomUUID(),
    name: file.name,
    type: file.type,
    size: file.size,
    pages,
    pageOrder: Array.from({ length: pages }, (_, index) => index + 1),
    crops: {},
    masks: {},
    checkedPages: [],
    blob: file,
  };
}
