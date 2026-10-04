import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const fixture = `
import React,{useState} from 'react';import {createRoot} from 'react-dom/client';
import {AssistenteEscritaChat} from './src/components/nina/AssistenteEscritaChat';
const g=globalThis;g.chamadas=[];
g.responder=({data})=>{g.chamadas.push(data);const execute=()=>{if(g.falhar)throw Error('indisponível');return {texto:data.acao==='sugerir'?'Temos consulta em cardiologia. Gostaria de verificar a agenda?':'Olá! A consulta custa R$ 120,00 no dinheiro.',fontes:data.acao==='sugerir'?[{id:'s',tipo:'servico',titulo:'Consulta Cardiologia',fonte:'Cadastro oficial — procedimentos',campos:[{nome:'Valores',texto:'Dinheiro: R$ 120,00'}]}]:[],modelo:'openai/gpt-5.6-luna',duracaoMs:1250,consultadoEm:new Date().toISOString()};};return g.atrasar?new Promise((resolve,reject)=>{g.finalizar=()=>{try{resolve(execute());}catch(e){reject(e);}};}):Promise.resolve().then(execute);};
function App(){const[id,setId]=useState('a');const[bloqueado,setBloqueado]=useState(false);const[aberto,setAberto]=useState(true);const[versao,setVersao]=useState(0);const[rascunhos,setRascunhos]=useState({a:'ola a consulta custa R$ 120,00 no dinheiro',b:'Olá, João!'});return <main data-os-zap="true" className="min-h-dvh bg-atd-bg p-3 text-atd-ink"><p className="mb-4">PRÉVIA FICTÍCIA · Assistente humano · IA simulada, nenhum envio</p><div className="mb-3 flex flex-wrap gap-3"><button onClick={()=>setId(id==='a'?'b':'a')}>Trocar paciente</button><button onClick={()=>setBloqueado(v=>!v)}>Alternar bloqueio</button><button onClick={()=>setAberto(v=>!v)}>Abrir assistente</button><button onClick={()=>setVersao(v=>v+1)}>Nova mensagem</button></div><h2 className="mb-3 font-semibold">Conversa {id}</h2>{aberto&&<AssistenteEscritaChat key={id} clinicaId="clinica" conversaId={id} rascunho={rascunhos[id]} contextoVersao={String(versao)} bloqueio={bloqueado?'Envio bloqueado':null} onFechar={()=>setAberto(false)} onAplicar={(texto,original)=>{if(bloqueado||rascunhos[id]!==original)return false;setRascunhos(prev=>({...prev,[id]:texto}));return true;}}/>}<div className="my-5 rounded-lg border border-atd-border p-4">Histórico da conversa permanece no chat.</div><label>Rascunho<textarea aria-label="Rascunho" className="mt-2 h-32 w-full rounded border border-atd-border bg-atd-surface p-2" value={rascunhos[id]} onChange={e=>setRascunhos({...rascunhos,[id]:e.target.value})}/></label></main>};createRoot(document.getElementById('root')).render(<App/>);`;
const js = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "mock",
      setup(b) {
        const mocks = {
          "@tanstack/react-start": "export const useServerFn=f=>f;",
          "@/lib/atendimento/assistente-escrita.functions":
            "export const gerarSugestaoEscrita=(p)=>globalThis.responder(p);",
        };
        b.onResolve({ filter: /.*/ }, (a) =>
          a.path in mocks ? { path: a.path, namespace: "mock" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "mock" }, (a) => ({ contents: mocks[a.path] }));
      },
    },
  ],
});
const css = await compile(await readFile("src/styles.css", "utf8"), {
  base: path.resolve("src"),
  onDependency() {},
});
const scanner = new Scanner({ sources: css.sources });
const styles =
  css.build(
    [...scanner.scan(), ...fixture.matchAll(/className="([^"]+)"/g)].flatMap((v) =>
      typeof v === "string" ? [v] : v[1].split(" "),
    ),
  ) + (await readFile("src/components/nina/os-zap.css", "utf8"));
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Assistente de escrita · prévia</title><style>${styles}html,body,#root{height:auto;overflow:visible}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text}</script></body></html>`;
await writeFile(path.join(out, "assistente-escrita.html"), html);
const server = createServer((req, res) => {
  res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" });
  res.end(html);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = `http://127.0.0.1:${server.address().port}`;
  await page.goto(url);
  const corrigir = page.getByRole("button", { name: "Corrigir português" });
  const usar = page.getByRole("button", { name: "Usar no rascunho" });
  const draft = page.getByRole("textbox", { name: "Rascunho", exact: true });
  await corrigir.click();
  await expect(usar).toBeEnabled();
  await expect(draft).toHaveValue("ola a consulta custa R$ 120,00 no dinheiro");
  await usar.click();
  await expect(draft).toHaveValue("Olá! A consulta custa R$ 120,00 no dinheiro.");
  await expect(page.getByRole("region", { name: "Assistente de escrita" })).toHaveCount(0);
  await page.getByRole("button", { name: "Abrir assistente" }).click();
  await page.evaluate(() => {
    globalThis.atrasar = true;
  });
  await corrigir.click();
  await draft.fill("Eu ainda estou editando");
  await page.evaluate(() => globalThis.finalizar());
  await expect(usar).toBeDisabled();
  await expect(draft).toHaveValue("Eu ainda estou editando");
  await page.getByRole("button", { name: "Melhorar clareza" }).click();
  await page.getByRole("button", { name: "Trocar paciente" }).click();
  await page.evaluate(() => globalThis.finalizar());
  await expect(draft).toHaveValue("Olá, João!");
  await expect(usar).toHaveCount(0);
  await corrigir.click();
  await page.getByRole("button", { name: "Alternar bloqueio" }).click();
  await page.evaluate(() => globalThis.finalizar());
  await expect(page.getByRole("alert")).toContainText("bloqueada");
  await expect(usar).toHaveCount(0);
  await page.getByRole("button", { name: "Alternar bloqueio" }).click();
  await page.evaluate(() => {
    globalThis.atrasar = false;
    globalThis.falhar = true;
  });
  await corrigir.click();
  await expect(page.getByRole("alert")).toContainText("rascunho foi preservado");
  await expect(draft).toHaveValue("Olá, João!");
  await page.evaluate(() => {
    globalThis.falhar = false;
  });
  await draft.fill("");
  await expect(corrigir).toBeDisabled();
  await page.getByRole("button", { name: "Sugerir resposta" }).click();
  await expect(usar).toBeEnabled();
  await page.getByRole("button", { name: "Nova mensagem" }).click();
  await expect(usar).toBeDisabled();
  await page.getByRole("button", { name: "Sugerir resposta" }).click();
  await expect(usar).toBeEnabled();
  await page.getByText("Conferir fontes (1)", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Assistente de escrita" })).toContainText(
    "Cadastro oficial",
  );
  await page.screenshot({ path: path.join(out, "assistente-escrita-desktop.png"), fullPage: true });
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: path.join(out, "assistente-escrita-escuro.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "21.6px";
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow móvel");
  await page.screenshot({ path: path.join(out, "assistente-escrita-mobile.png"), fullPage: true });
  await page.getByRole("textbox", { name: /Assunto na base/ }).press("Escape");
  await expect(page.getByRole("region", { name: "Assistente de escrita" })).toHaveCount(0);
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Assistente: revisão explícita, rascunho preservado, troca de paciente, bloqueio, falha, contexto novo, fontes, Escape e temas/mobile: OK. IA simulada, sem envio.",
  );
} finally {
  await browser.close();
  server.close();
}
