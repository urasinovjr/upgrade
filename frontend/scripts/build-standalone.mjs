import { build } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const root = new URL("../", import.meta.url);
const templateName = "index.html";
const entryPath = "/src/main.tsx";
const result = await build({
  root: fileURLToPath(root),
  mode: "standalone",
  base: "./",
  build: {
    write: false,
    copyPublicDir: false,
    assetsInlineLimit: () => true,
    cssCodeSplit: false,
    rolldownOptions: {
      input: fileURLToPath(new URL(templateName, root)),
      output: { codeSplitting: false },
    },
  },
});
const outputs = Array.isArray(result) ? result.flatMap((item) => item.output) : result.output;
const chunks = outputs.filter((item) => item.type === "chunk");
if (
  chunks.length !== 1 ||
  chunks[0].imports.length ||
  chunks[0].dynamicImports.some((filename) => filename !== chunks[0].fileName)
)
  throw new Error("Сборка должна содержать один скрипт без внешних модулей.");
if (
  outputs.some(
    (item) =>
      item.type === "asset" && item.fileName !== templateName && !item.fileName.endsWith(".css"),
  )
)
  throw new Error("В сборке остались отдельные ресурсы.");
const styles = outputs
  .filter((item) => item.type === "asset" && item.fileName.endsWith(".css"))
  .map((item) => String(item.source))
  .join("\n");
if (/url\((?!["']?data:)/i.test(styles)) throw new Error("В стилях остались внешние ресурсы.");
const icon = (await readFile(new URL("public/upgrade-icon.svg", root))).toString("base64");
const code = chunks[0].code.replace(/<\/script/gi, "<\\/script");
const template = await readFile(new URL(templateName, root), "utf8");
const entry = '<script type="module" src="' + entryPath + '"></script>';
if (!template.includes(entry)) throw new Error("В HTML-шаблоне не найден скрипт приложения.");
const html = template
  .replace('href="/upgrade-icon.svg"', 'href="data:image/svg+xml;base64,' + icon + '"')
  .replace("</head>", () => "<style>" + styles + "</style></head>")
  .replace(entry, () => '<script type="module">' + code + "</script>");
const output = new URL("../../output/UpGrade.html", import.meta.url);
await mkdir(new URL("./", output), { recursive: true });
await writeFile(output, html);
console.log(
  "Готово: " + output.pathname + " (" + (Buffer.byteLength(html) / 1024 / 1024).toFixed(1) + " МБ)",
);
