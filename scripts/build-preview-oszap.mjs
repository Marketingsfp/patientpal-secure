import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const bundle = await build({
  entryPoints: ["scripts/preview-oszap.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
});
const css = await compile(await readFile("src/styles.css", "utf8"), {
  base: path.resolve("src"),
  onDependency() {},
});
const scanner = new Scanner({
  sources: [
    ...css.sources,
    { base: process.cwd(), pattern: "scripts/preview-oszap.tsx", negated: false },
  ],
});
const styles =
  css.build(scanner.scan()) + "\n" + (await readFile("src/components/nina/os-zap.css", "utf8"));
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OS ZAP · Prévia visual</title><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`,
);
console.log(out);
