// Componente real e regras reais; cards/ações/transporte fictícios, sem dados da clínica.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const contents = `
  import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
  import {BadgeConversaNova} from './src/components/nina/BadgeConversaNova';
  import {aplicarAberturaConfirmada,entradaAtendimento} from './src/lib/atendimento/conversa-nova';
  const initial = {id:'c1',contato_nome:'Paciente fictícia',owner_type:'HUMAN',status:'active',
    atribuida_user_id:'ana',inbox_entrada_em:'2026-10-03T10:00:00Z',nao_lidas:3};
  function Preview(){
    const [c,setC]=useState(()=>JSON.parse(localStorage.getItem('card-novo')||'null')||initial);
    const [dark,setDark]=useState(false);
    const save = next=>{localStorage.setItem('card-novo',JSON.stringify(next));setC(next)};
    return <div className={dark?'dark':''}><main data-os-zap="true" className="min-h-screen bg-atd-bg p-4 text-atd-ink">
      <h1 className="mb-3 text-lg font-semibold">OS ZAP · Selo Novo</h1>
      <p className="mb-4 text-sm text-muted-foreground">Prévia com dados fictícios. Ações simuladas.</p>
      <div className="w-full max-w-80 border border-atd-border bg-atd-surface">
        <button className="oszap-conversation w-full border-b border-atd-border px-3 text-left"
          onClick={()=>save(aplicarAberturaConfirmada(c,{userId:c.atribuida_user_id,entradaEm:entradaAtendimento(c)}))}>
          <div className="flex items-center gap-2"><b className="min-w-0 flex-1 truncate text-sm">Paciente fictícia com nome comprido</b>
            <BadgeConversaNova conversa={c}/><span className="text-xs" data-nao-lidas>{c.nao_lidas}</span></div>
          <p className="truncate text-xs text-muted-foreground">Gostaria de saber sobre uma consulta.</p>
        </button>
        <div className="oszap-conversation px-3 text-sm">Outra conversa</div>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <button onClick={()=>save({...c,nao_lidas:c.nao_lidas+1})}>Nova mensagem no mesmo atendimento</button>
        <button onClick={()=>save({...c,status:'closed'})}>Encerrar</button>
        <button onClick={()=>save({...c,status:'active',inbox_entrada_em:'2026-10-04T10:00:00Z'})}>Paciente retorna e recebe atribuição</button>
        <button onClick={()=>save({...c,atribuida_user_id:'bia',inbox_entrada_em:'2026-10-04T11:00:00Z'})}>Transferir</button>
        <button onClick={()=>setDark(!dark)}>Alternar tema</button>
      </div>
    </main></div>
  }createRoot(document.getElementById('root')).render(<Preview/>);`;
const bundle = await build({
  stdin: { contents, resolveDir: process.cwd(), loader: "tsx" },
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
const scanner = new Scanner({ sources: css.sources });
const styles =
  css.build([...scanner.scan(), "min-h-screen", "max-w-80", "p-4", "min-w-0"]) +
  (await readFile("src/components/nina/os-zap.css", "utf8"));
const file = path.join(out, "novo.html");
await writeFile(
  file,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`,
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(pathToFileURL(file).href);
  const badge = page.getByTestId("conversa-nova");
  const abrir = page.getByRole("button", { name: /Paciente fictícia com nome comprido/ });
  await expect(badge).toBeVisible();
  await expect(badge.locator("svg")).toHaveCount(1);
  await page.screenshot({ path: path.join(out, "novo-light.png") });
  await page.getByRole("button", { name: "Alternar tema" }).click();
  await page.screenshot({ path: path.join(out, "novo-dark.png") });
  await abrir.click();
  await expect(badge).toHaveCount(0);
  await expect(page.locator("[data-nao-lidas]")).toHaveText("3");
  await page.getByRole("button", { name: "Nova mensagem no mesmo atendimento" }).click();
  await expect(badge).toHaveCount(0);
  await expect(page.locator("[data-nao-lidas]")).toHaveText("4");
  await page.reload();
  await expect(badge).toHaveCount(0);
  await page.getByRole("button", { name: "Encerrar", exact: true }).click();
  await expect(badge).toHaveCount(0);
  await page.getByRole("button", { name: "Paciente retorna e recebe atribuição" }).click();
  await expect(badge).toBeVisible();
  await abrir.click();
  await expect(badge).toHaveCount(0);
  await page.getByRole("button", { name: "Transferir", exact: true }).click();
  await expect(badge).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: path.join(out, "novo-mobile.png") });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no celular");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "PASS: componente Novo, ícone, primeira abertura, mensagens posteriores, F5, encerramento/retorno, transferência, temas e celular. Ações e persistência da prévia simuladas; sem acesso a pacientes.",
  );
} finally {
  await browser.close();
}
