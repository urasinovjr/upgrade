declare module "virtual:standalone-pdf-assets" {
  const assets: Record<string, string>;
  export default assets;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs" {
  export const WorkerMessageHandler: unknown;
}
