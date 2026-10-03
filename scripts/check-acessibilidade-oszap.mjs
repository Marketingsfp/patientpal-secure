// Layout e controles reais; autenticação/banco inertes, nenhum paciente acessado.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const mocks = {
  "@/hooks/use-auth": "export const useAuth=()=>({user:null});",
  "@/integrations/supabase/client": "export const supabase={};",
};
const bundle = await build({
  entryPoints: ["scripts/preview-acessibilidade-oszap.tsx"],
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "inert-auth",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          a.path in mocks ? { path: a.path, namespace: "mock" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({
          contents: mocks[a.path],
          loader: "js",
        }));
      },
    },
  ],
});
const css = await compile(await readFile("src/styles.css", "utf8"), {
  base: path.resolve("src"),
  onDependency() {},
});
const scan = new Scanner({
  sources: [
    ...css.sources,
    { base: process.cwd(), pattern: "scripts/preview-acessibilidade-oszap.tsx", negated: false },
  ],
});
const styles = css.build(scan.scan()) + (await readFile("src/components/nina/os-zap.css", "utf8"));
const file = path.join(out, "acessibilidade.html");
await writeFile(
  file,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`,
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(/^https?:/, (route) => route.abort());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href, { waitUntil: "domcontentloaded" });
  const trigger = page.getByRole("button", { name: "Acessibilidade", exact: true });
  const chat = page.locator("[data-chat]");
  const draft = page.getByLabel("Rascunho de atendimento");
  await draft.fill("Mensagem preservada");
  const inicial = await chat.boundingBox();
  await trigger.click();
  const painel = page.getByRole("region", { name: "Acessibilidade" });
  await expect(painel).toBeVisible();
  await page.waitForTimeout(250);
  const panelBox = await painel.boundingBox();
  const contactBox = await page.locator("[data-contatos]").boundingBox();
  const chatBox = await chat.boundingBox();
  if (contactBox.x + contactBox.width > panelBox.x + 1) throw Error("Painel cobre Contatos");
  if (chatBox.width >= inicial.width - 300) throw Error("Painel não reservou sua largura");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await draft.fill("Chat utilizável com acessibilidade aberta");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.waitForTimeout(250);
  const comMenu = await page.locator("[data-contatos]").boundingBox();
  const painelComMenu = await painel.boundingBox();
  if (comMenu.x + comMenu.width > painelComMenu.x + 1) throw Error("Dois painéis sobrepostos");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(out, "acessibilidade-desktop.png") });
  await page.getByTitle("Texto 115%", { exact: true }).click();
  await expect(page.getByTitle("Texto 115%", { exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.keyboard.press("Escape");
  await expect(painel).toHaveCount(0);
  await expect(trigger).toBeFocused();
  await expect(draft).toHaveValue("Chat utilizável com acessibilidade aberta");
  await trigger.click();
  await expect(page.getByTitle("Texto 115%", { exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByTitle("Texto 100%", { exact: true }).click();
  await page.getByRole("button", { name: "Fechar acessibilidade" }).click();
  await page.waitForTimeout(250);
  const restaurada = await chat.boundingBox();
  if (Math.abs(restaurada.width - inicial.width) > 1) throw Error("Largura não restaurada");
  await page.setViewportSize({ width: 390, height: 844 });
  await trigger.click();
  await expect(painel).toBeVisible();
  await page.waitForTimeout(300);
  const mobileBox = await painel.boundingBox();
  if (Math.abs(mobileBox.width - 360) > 1) throw Error("Painel estreito no celular");
  await expect(page.getByRole("button", { name: "Fechar acessibilidade" })).toBeInViewport();
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no celular");
  await page.screenshot({ path: path.join(out, "acessibilidade-mobile.png") });
  await page.getByRole("button", { name: "Fechar acessibilidade" }).click();
  await expect(draft).toHaveValue("Chat utilizável com acessibilidade aberta");
  // Demais portais conservam a gaveta modal existente.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Alternar portal" }).click();
  await trigger.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(painel).toHaveCount(0);
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Acessibilidade: coluna sem sobreposição, menu+Contatos, chat utilizável, rascunho preservado, foco/Esc, preferências, celular e gaveta dos demais portais: OK.",
  );
} finally {
  await browser.close();
}
