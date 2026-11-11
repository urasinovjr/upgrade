import { spawnSync } from "node:child_process";
import path from "node:path";

const repository = path.resolve(import.meta.dirname, "../..");
const image =
  "mcr.microsoft.com/playwright:v1.63.0-noble@sha256:eff16c30e6f3f4af0a03fa4b706120d5e9b0891c344a27d64559aff5900a4a27";
const staticBuild = process.env.VISUAL_STATIC === "1";
const playwrightArgs = process.argv.slice(2).map((arg) => "'" + arg.replaceAll("'", "'\\''") + "'");
const command = [
  "npm ci --no-audit --no-fund",
  ...(staticBuild
    ? [
        "NODE_ENV=development npx vite build --outDir ../output/visual-final-demo --emptyOutDir",
        "NODE_ENV=development npx vite build --mode server --outDir ../output/visual-final-server --emptyOutDir",
      ]
    : []),
  [
    (staticBuild ? "VISUAL_STATIC=1 " : "") + "npx playwright test -c playwright.visual.config.ts",
    ...playwrightArgs,
  ].join(" "),
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
