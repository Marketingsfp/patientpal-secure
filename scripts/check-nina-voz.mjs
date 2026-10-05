// Monta o componente real com servidor simulado, sem credenciais nem chamadas pagas.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";

const out = path.resolve("../voz-nina-preview");
await mkdir(out, { recursive: true });
const mocks = {
  "@/hooks/use-clinica": `export const useClinica=()=>({clinicaAtual:{clinica_id:"clinica-teste"}});`,
  "@/hooks/use-auth": `export const useAuth=()=>({session:{user:{id:"admin"}},loading:false});`,
  "@/lib/cache/clinic-flags-cache": `export const invalidateClinicFlags=()=>{};`,
  "@tanstack/react-start": `export const useServerFn=f=>f;`,
  "@/lib/nina/voz-config.functions": `
    const padrao={voz:"nova",velocidade:1,estilo:"natural",orientacoes:"",respostasLongas:"resumo_texto",limiteResumo:350};
    const params=new URLSearchParams(location.search);
    let estado={configuracao:padrao,audioAtivo:true,revisao:null,origem:"padrao",podeEditar:!params.has("leitura")};
    window.__vozTeste={salvos:[],previas:[]};
    export const carregarVozNina=async()=>structuredClone(estado);
    export const salvarVozNina=async({data})=>{
      window.__vozTeste.salvos.push(data);
      estado={...estado,configuracao:data.configuracao,audioAtivo:data.audioAtivo,revisao:new Date().toISOString(),origem:"configurada"};
      return structuredClone(estado);
    };
    export const ouvirPreviaVozNina=async({data})=>{
      window.__vozTeste.previas.push(data);
      if(params.has("falha"))throw new Error("O serviço de voz está indisponível. Nada foi salvo.");
      return {base64:"UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=",mime:"audio/wav",aviso:null};
    };`,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
    import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
    import {VozNina} from './src/components/nina/VozNina';
    createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><VozNina/></QueryClientProvider>);`,
    loader: "tsx",
    resolveDir: process.cwd(),
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "nina-voz-servidor-simulado",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          mocks[a.path] ? { path: a.path, namespace: "mock" } : undefined,
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
const scanner = new Scanner({
  sources: [
    ...css.sources,
    { base: process.cwd(), pattern: "src/components/nina/VozNina.tsx", negated: false },
  ],
});
await writeFile(
  path.join(out, "index.html"),
  `<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voz da Nina — teste visual</title><style>${css.build(scanner.scan())} html,body{height:auto!important;overflow:visible!important;}</style></head><body class="bg-background text-foreground"><main id="root" class="p-4 md:p-8"></main><script>${bundle.outputFiles[0].text}</script></body></html>`,
);

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = pathToFileURL(path.join(out, "index.html")).href;
  await page.goto(url);
  await page.getByRole("heading", { name: "Voz da Nina", exact: true }).waitFor();
  for (const [name, width, height] of [
    ["desktop", 1440, 1000],
    ["mobile", 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      name + " sem overflow",
    );
    await page.screenshot({ path: path.join(out, name + ".png"), fullPage: true });
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel("Voz", { exact: true }).selectOption("coral");
  await page.getByLabel("Velocidade da fala", { exact: true }).fill("0.9");
  await page.getByLabel("Estilo de fala", { exact: true }).selectOption("acolhedor");
  await page.getByLabel("Pronúncia, sotaque e entonação").fill("Pronuncie ECG letra por letra.");
  await page.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await page.getByLabel("Prévia da voz da Nina").waitFor();
  const previa = await page.evaluate(() => window.__vozTeste);
  assert.equal(previa.salvos.length, 0, "prévia não salva preferências");
  assert.equal(previa.previas[0].configuracao.voz, "coral");
  assert.equal(previa.previas[0].configuracao.velocidade, 0.9);
  await page.getByRole("button", { name: "Salvar configuração", exact: true }).click();
  await page.getByText("Áudio ativado", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Recarregar", exact: true }).click();
  assert.equal(await page.getByLabel("Voz", { exact: true }).inputValue(), "coral");
  await page.getByRole("switch", { name: "Responder em áudio", exact: true }).click();
  await page.getByRole("button", { name: "Salvar configuração", exact: true }).click();
  await page.getByText("Respostas por texto", { exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__vozTeste.salvos.at(-1).audioAtivo), false);
  await page.getByRole("button", { name: "Restaurar voz padrão", exact: true }).click();
  assert.equal(await page.getByLabel("Voz", { exact: true }).inputValue(), "nova");
  assert.equal(
    await page.evaluate(() => window.__vozTeste.salvos.length),
    2,
    "restaurar só muda rascunho",
  );
  await page.getByLabel("Velocidade da fala", { exact: true }).fill("9");
  assert.equal(
    await page.getByRole("button", { name: "Salvar configuração", exact: true }).isDisabled(),
    true,
  );
  await page.goto(url + "?leitura=1");
  await page.getByRole("heading", { name: "Voz da Nina", exact: true }).waitFor();
  assert.equal(await page.getByLabel("Voz", { exact: true }).isDisabled(), true);
  assert.equal(
    await page.getByRole("button", { name: "Gerar prévia", exact: true }).isDisabled(),
    true,
  );
  assert.equal(
    await page.getByRole("button", { name: "Salvar configuração", exact: true }).count(),
    0,
  );
  await page.goto(url + "?falha=1");
  await page.getByRole("button", { name: "Gerar prévia", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Nada foi salvo" }).waitFor();
  assert.equal(await page.evaluate(() => window.__vozTeste.salvos.length), 0);
  assert.deepEqual(errors, []);
  console.log(
    "Voz da Nina: desktop/mobile sem overflow; seleção, prévia isolada, salvar, recarregar, restaurar, validação, leitura e falha passaram. Serviços simulados.",
  );
  console.log(out);
} finally {
  await browser.close();
}
