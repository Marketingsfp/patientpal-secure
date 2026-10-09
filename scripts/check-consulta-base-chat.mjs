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
import {ConsultaBaseChat} from './src/components/nina/ConsultaBaseChat';
import {itensBaseChat,pesquisarBaseChat,textoBaseParaRascunho,acrescentarBaseAoRascunho} from './src/lib/atendimento/consulta-base-chat';
const g=globalThis;g.chamadas=[];g.rascunhos={a:'Olá, Maria!',b:'Olá, João!'};
const base={servicos:[{id:'s',nome:'Ultrassonografia abdominal total',valor:null,valor_observacao:null,descricao_publica:null,preparo:'Preparo fictício para validar a interface.',restricoes:null,executantes:[{nome:'Dra. Ana',horarios:'Segunda, 08h–12h'}],formas_pagamento:[{forma:'Dinheiro',valor:150},{forma:'Cartão',valor:180}]}],profissionais:[]};
g.responder=({data})=>{g.chamadas.push(data);const execute=()=>{if(g.falhar)throw Error('indisponível');const itens=itensBaseChat(base,'2026-10-03');const consultadoEm=new Date().toISOString();return data.registro?{itens,total:1,pagina:0,consultadoEm,texto:textoBaseParaRascunho(itens[0],consultadoEm)}:{...pesquisarBaseChat(itens,data.termo,data.pagina),consultadoEm,texto:null};};return g.atrasar?new Promise((resolve,reject)=>{g.finalizar=()=>{try{resolve(execute());}catch(e){reject(e);}};}):Promise.resolve().then(execute);};
function App(){const[id,setId]=useState('a');const[bloqueado,setBloqueado]=useState(false);const[aberto,setAberto]=useState(true);const[rascunhos,setRascunhos]=useState(g.rascunhos);return <div data-os-zap="true" className="min-h-dvh bg-atd-bg p-3 text-atd-ink"><p className="mb-4">PRÉVIA FICTÍCIA · Consulta dentro do chat · Nenhum envio real</p><div className="mb-3 flex flex-wrap gap-3"><button onClick={()=>setId(id==='a'?'b':'a')}>Trocar paciente</button><button onClick={()=>setBloqueado(v=>!v)}>Alternar bloqueio</button><button onClick={()=>setAberto(v=>!v)}>Consultar base</button></div><h2 className="mb-3 font-semibold">Conversa {id}</h2>{aberto&&<ConsultaBaseChat key={id} clinicaId="clinica" conversaId={id} bloqueio={bloqueado?'Envio bloqueado':null} onFechar={()=>setAberto(false)} onInserir={texto=>{if(bloqueado)return false;setRascunhos(prev=>{const novo={...prev,[id]:acrescentarBaseAoRascunho(prev[id],texto)};g.rascunhos=novo;return novo;});return true;}}/>}<div className="my-5 rounded-lg border border-atd-border p-4">Histórico de mensagens preservado abaixo da consulta.</div><label>Rascunho<textarea aria-label="Rascunho" className="mt-2 h-48 w-full rounded border border-atd-border bg-atd-surface p-2" value={rascunhos[id]} onChange={e=>setRascunhos({...rascunhos,[id]:e.target.value})}/></label></div>};createRoot(document.getElementById('root')).render(<App/>);`;
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
          "@/lib/atendimento/consulta-base-chat.functions":
            "export const consultarBaseChat=(p)=>globalThis.responder(p);",
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
const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Consulta à base no chat · prévia</title><style>${styles}html,body,#root{height:auto;overflow:visible}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text}</script></body></html>`;
await writeFile(path.join(out, "consulta-base-chat.html"), html);
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
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const busca = page.getByRole("textbox", { name: "Buscar no cadastro oficial" });
  const inserir = page.getByRole("button", { name: "Inserir no rascunho" });
  await busca.fill("ultrassom abdominal total");
  await busca.press("Enter");
  await expect(inserir).toBeVisible();
  await page.getByText("Ver informações e fonte", { exact: true }).click();
  await expect(page.getByRole("region", { name: "Consulta à base no chat" })).toContainText(
    "vagas precisam ser verificadas",
  );
  await expect(page.getByRole("textbox", { name: "Rascunho", exact: true })).toHaveValue(
    "Olá, Maria!",
  );
  await page.screenshot({ path: path.join(out, "consulta-base-desktop.png"), fullPage: true });
  await inserir.click();
  await expect(page.getByRole("textbox", { name: "Rascunho", exact: true })).toHaveValue(
    /Olá, Maria![\s\S]*Fonte: Cadastro oficial/,
  );
  await page.evaluate(() => {
    globalThis.atrasar = true;
  });
  await inserir.click();
  await page.getByRole("button", { name: "Trocar paciente" }).click();
  await page.evaluate(() => globalThis.finalizar());
  await expect(page.getByRole("textbox", { name: "Rascunho", exact: true })).toHaveValue(
    "Olá, João!",
  );
  await expect(page.getByRole("region", { name: "Consulta à base no chat" })).not.toContainText(
    "Ultrassonografia abdominal total",
  );
  await page.evaluate(() => {
    globalThis.atrasar = false;
  });
  await busca.fill("ultrassom");
  await busca.press("Enter");
  await expect(inserir).toBeVisible();
  await page.getByRole("button", { name: "Alternar bloqueio" }).click();
  await expect(inserir).toBeDisabled();
  await page.getByRole("button", { name: "Alternar bloqueio" }).click();
  await page.evaluate(() => {
    globalThis.atrasar = true;
  });
  await inserir.click();
  await page.getByRole("button", { name: "Alternar bloqueio" }).click();
  await page.evaluate(() => globalThis.finalizar());
  await expect(page.getByRole("alert")).toContainText("rascunho não foi alterado");
  await expect(page.getByRole("textbox", { name: "Rascunho", exact: true })).toHaveValue(
    "Olá, João!",
  );
  await page.evaluate(() => {
    globalThis.atrasar = false;
    globalThis.falhar = true;
  });
  await busca.fill("ultrassom");
  await busca.press("Enter");
  await expect(page.getByRole("alert")).toContainText("Não foi possível consultar");
  await expect(inserir).toHaveCount(0);
  await page.evaluate(() => {
    globalThis.falhar = false;
    document.documentElement.classList.add("dark");
  });
  await busca.fill("ultrassom");
  await busca.press("Enter");
  await expect(inserir).toBeVisible();
  await page.getByText("Ver informações e fonte", { exact: true }).click();
  await page.screenshot({ path: path.join(out, "consulta-base-escuro.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => {
    document.documentElement.style.fontSize = "21.6px";
  });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("overflow móvel");
  await page.screenshot({ path: path.join(out, "consulta-base-mobile.png"), fullPage: true });
  await busca.press("Escape");
  await expect(page.getByRole("region", { name: "Consulta à base no chat" })).toHaveCount(0);
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Consulta no chat: busca, fonte, rascunho preservado, troca durante requisição, bloqueio durante inserção, erro, Escape, temas e celular: OK. Fonte simulada, sem envio.",
  );
} finally {
  await browser.close();
  server.close();
}
