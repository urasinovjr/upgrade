import { Document, Page, pdfjs } from "react-pdf";
import { useState } from "react";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";
import options from "./pdfOptions";
async function openPdf(blob: Blob) {
  return pdfjs.getDocument({ data: new Uint8Array(await blob.arrayBuffer()), ...options });
}
export async function pdfPageCount(blob: Blob) {
  const task = await openPdf(blob);
  try {
    const pdf = await task.promise;
    return pdf.numPages;
  } finally {
    await task.destroy();
  }
}
export async function pdfImages(blob: Blob): Promise<string[]> {
  const task = await openPdf(blob);
  try {
    const pdf = await task.promise;
    const images: string[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const viewport = page.getViewport({ scale: 1.5 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      await page.render({ canvas, viewport }).promise;
      images.push(canvas.toDataURL("image/png"));
      page.cleanup();
    }
    return images;
  } finally {
    await task.destroy();
  }
}
export default function PdfPage({
  url,
  page,
  width,
  onPages,
}: {
  url: string;
  page: number;
  width: number;
  onPages?: (count: number) => void;
}) {
  const [error, setError] = useState("");
  return (
    <Document
      options={options}
      file={url}
      onLoadSuccess={({ numPages }) => onPages?.(numPages)}
      onLoadError={() =>
        setError("PDF не удалось открыть. Проверьте файл или загрузите его заново.")
      }
      loading={<p>Открываем PDF…</p>}
      error={<p role="alert">{error || "Не удалось открыть PDF."}</p>}
    >
      <Page
        pageNumber={page}
        width={width}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        loading={<p>Загружаем страницу…</p>}
      />
    </Document>
  );
}
