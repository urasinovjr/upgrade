import { cp, mkdir } from "node:fs/promises";
const root = new URL("../", import.meta.url);
for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
  const target = new URL("public/pdf/" + directory + "/", root);
  await mkdir(target, { recursive: true });
  await cp(new URL("node_modules/pdfjs-dist/" + directory + "/", root), target, {
    recursive: true,
  });
}
