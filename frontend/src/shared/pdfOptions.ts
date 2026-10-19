import { pdfjs } from "react-pdf";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

export default {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
  wasmUrl: "/pdf/wasm/",
};
