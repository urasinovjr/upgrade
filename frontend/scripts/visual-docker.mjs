import { spawnSync } from "node:child_process";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "../..");
const image = "mcr.microsoft.com/playwright:v1.63.0-noble";
const playwrightArgs = process.argv.slice(2).map((arg) => JSON.stringify(arg));
const command = [
  "npm ci --no-audit --no-fund",
  ["npx playwright test -c playwright.visual.config.ts", ...playwrightArgs].join(" "),
].join(" && ");

const result = spawnSync(
  "docker",
  [
    "run",
    "--rm",
    "--ipc=host",
    "--volume",
    repository + ":/repo",
    "--volume",
    "upgrade-visual-node-modules:/repo/frontend/node_modules",
    "--workdir",
    "/repo/frontend",
    image,
    "sh",
    "-c",
    command,
  ],
  { stdio: "inherit" },
);
process.exit(result.status ?? 1);
