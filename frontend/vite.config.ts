import { defineConfig, type Plugin } from "vite";
import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import react from "@vitejs/plugin-react";

function embeddedPdfAssets(): Plugin {
  const id = "\0virtual:standalone-pdf-assets";
  return {
    name: "standalone-assets",
    transform(code, id) {
      if (!id.endsWith("/mathlive/mathlive.mjs")) return;
      const lookup = /var gScriptUrl = .* \|\| getFileUrl\(\);/;
      if (!lookup.test(code)) throw new Error("Изменился механизм ресурсов MathLive.");
      return code.replace(lookup, "var gScriptUrl = import.meta.url;");
    },
    resolveId(source) {
      if (source === "virtual:standalone-pdf-assets") return id;
    },
    async load(source) {
      if (source !== id) return;
      const assets: Record<string, string> = {};
      for (const directory of ["cmaps", "standard_fonts", "wasm"]) {
        const root = resolve(import.meta.dirname, "node_modules/pdfjs-dist", directory);
        for (const name of (await readdir(root)).sort()) {
          if (name.endsWith(".LICENSE") || name.endsWith(".js")) continue;
          assets[directory + "/" + name] = (await readFile(resolve(root, name))).toString("base64");
        }
      }
      return "export default " + JSON.stringify(assets);
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === "standalone" ? [embeddedPdfAssets()] : [])],
  resolve: {
    alias:
      mode === "standalone"
        ? [
            {
              find: /^mathlive$/,
              replacement: resolve(import.meta.dirname, "node_modules/mathlive/mathlive.mjs"),
            },
            {
              find: "./pdfOptions",
              replacement: resolve(import.meta.dirname, "src/shared/pdfOptions.standalone.ts"),
            },
          ]
        : [],
  },
  server: { port: 5173, strictPort: true },
  build: { target: "es2022" },
}));
