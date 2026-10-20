import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = path.resolve(import.meta.dirname, "..");
const folders = ["src", "e2e", "e2e-server", "scripts"];
const configFiles = [
  "vite.config.ts",
  "vitest.config.ts",
  "playwright.config.ts",
  "playwright.server.config.ts",
  "eslint.config.js",
];
const extensions = [".ts", ".tsx", ".js", ".mjs", ".css"];

function listFiles(folder: string): string[] {
  const files: string[] = [];
  for (const name of readdirSync(folder)) {
    const fullPath = path.join(folder, name);
    if (statSync(fullPath).isDirectory()) files.push(...listFiles(fullPath));
    else if (extensions.includes(path.extname(name))) files.push(fullPath);
  }
  return files;
}

function scriptComments(file: string, text: string): string[] {
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
  const found = new Set<string>();

  const collect = (ranges: ts.CommentRange[] | undefined) => {
    for (const range of ranges ?? []) {
      const comment = text.slice(range.pos, range.end);
      if (!comment.startsWith("/// <reference")) found.add(comment);
    }
  };

  const visit = (node: ts.Node) => {
    if (node.kind === ts.SyntaxKind.JsxText) return;
    collect(ts.getLeadingCommentRanges(text, node.pos));
    collect(ts.getTrailingCommentRanges(text, node.end));
    node.getChildren(source).forEach(visit);
  };

  visit(source);
  return [...found];
}

function cssComments(text: string): string[] {
  return text.match(/\/\*[\s\S]*?\*\//g) ?? [];
}

const files = [
  ...folders.flatMap((folder) => listFiles(path.join(root, folder))),
  ...configFiles.map((name) => path.join(root, name)),
];

describe("code shape", () => {
  it.each(files.map((file) => path.relative(root, file)))("%s has no comments", (file) => {
    const text = readFileSync(path.join(root, file), "utf8");
    const comments = file.endsWith(".css") ? cssComments(text) : scriptComments(file, text);
    expect(comments).toEqual([]);
  });
});
