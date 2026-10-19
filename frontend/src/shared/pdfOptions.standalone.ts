import { WorkerMessageHandler } from "pdfjs-dist/build/pdf.worker.min.mjs";
import assets from "virtual:standalone-pdf-assets";

Object.assign(globalThis, { pdfjsWorker: { WorkerMessageHandler } });

class EmbeddedBinaryDataFactory {
  async fetch({ kind, filename }: { kind: string; filename: string }) {
    const directory = {
      cMapUrl: "cmaps",
      standardFontDataUrl: "standard_fonts",
      wasmUrl: "wasm",
    }[kind];
    const encoded = assets[directory + "/" + filename];
    if (!encoded) throw new Error("Ресурс PDF не найден: " + filename);
    return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  }
}

export default {
  cMapUrl: "/pdf/cmaps/",
  cMapPacked: true,
  standardFontDataUrl: "/pdf/standard_fonts/",
  wasmUrl: "/pdf/wasm/",
  useWorkerFetch: false,
  BinaryDataFactory: EmbeddedBinaryDataFactory,
};
