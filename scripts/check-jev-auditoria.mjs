// Tela real; apenas sessão e transporte de dados simulados. Não usa pacientes reais.
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
import React from 'react'; import {createRoot} from 'react-dom/client';
import {Route} from './src/routes/_authenticated/app.nina-jev';
import {perguntasComAuditoriaJev} from './src/lib/nina/jev-auditoria';
import {lerObservacaoIntencao} from './src/lib/nina/jev-observacao-intencao';
import {orientarIntencaoJev} from './src/lib/nina/jev-orientacao-intencao';
const g=globalThis;g.consultas=[];
const id='11111111-1111-4111-8111-111111111111';
g.linhas=[
 {id:'1',fase:'fase1_intencao',conversation_id:id,perguntas:perguntasComAuditoriaJev(['intencao'],undefined,{origem:'paciente',texto:'Vocês têm cardiologista? <script>alert(1)</script>'})},
 {id:'2',fase:'fase6_conferencia',conversation_id:id,perguntas:perguntasComAuditoriaJev([],undefined,{origem:'resposta_nina',texto:'Posso consultar a agenda para você.'})},
 {id:'3',fase:'fase2_encaminhamento',conversation_id:'conversa-legada',perguntas:['intencao']},
 {id:'4',fase:'fase3_especialidade',conversation_id:null,perguntas:{termo:'cardio'}},
 {id:'5',fase:'fase7_escolha',conversation_id:id,perguntas:perguntasComAuditoriaJev([],undefined,{origem:'paciente',texto:'texto longo '.repeat(700)})}
].map((d)=>({created_at:'2026-10-04T12:00:00Z',teste:false,aplicada:true,latency_ms:366,erro:null,respostas:{intencao:{choice:'medico',confidence:.98}},...d}));
g.linhas[0].respostas._observacao_intencao=lerObservacaoIntencao({obs_pedido_preco:{noul:.98},obs_pedido_horario_habitual:{noul:.96},obs_pedido_disponibilidade:{noul:.01},obs_autorizacao:{choice:'nenhuma',confidence:.99},obs_correcao:{choice:'especialidade',confidence:.65}});
g.linhas[0].respostas._orientacao_intencao=orientarIntencaoJev(g.linhas[0].respostas._observacao_intencao,['medico']);
g.linhas[2].respostas={...g.linhas[2].respostas,_observacao_intencao:lerObservacaoIntencao({obs_pedido_preco:{noul:.95}})};
const App=Route.component; createRoot(document.getElementById('root')).render(<App/>);`;
const mocks = {
  "@tanstack/react-router": `export const createFileRoute=()=>x=>x;`,
  "@/hooks/use-clinica": `export const useClinica=()=>({clinicaAtual:{clinica_id:'clinica-teste',role:'telefonia',clinica:{nome:'Clínica fictícia — validação local'}}});`,
  "@/integrations/supabase/client": `export const supabase={from(tabela){const q={tabela,filtros:[]};const chain={select(c){q.colunas=c;return chain},eq(k,v){q.filtros.push([k,v]);return chain},gte(){return chain},order(){return chain},limit(){return chain},in(k,v){q.ids=v;return chain},maybeSingle(){return chain},then(resolve,reject){globalThis.consultas.push(q);const data=tabela==='atend_conversas'?[{id:'11111111-1111-4111-8111-111111111111',numero_conversa:4551}]:tabela==='nina_jev_limites'?null:q.colunas==='respostas'?[]:globalThis.linhas;return Promise.resolve({data,error:null}).then(resolve,reject)}};return chain}};`,
};
const js = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, format: "iife", jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixtures", setup(b) {
    b.onResolve({ filter: /.*/ }, (a) => a.path in mocks ? { path: a.path, namespace: "fixture" } : undefined);
    b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({ contents: mocks[a.path] }));
  } }],
});
const css = await compile(await readFile("src/styles.css", "utf8"), { base: path.resolve("src"), onDependency() {} });
const styles = css.build(new Scanner({ sources: css.sources }).scan());
const html = `<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text.replaceAll("</script>", "<\\/script>")}</script></body></html>`;
await writeFile(path.join(out, "jev-auditoria.html"), html);
const server = createServer((req, res) => { res.writeHead(200, { "Content-Type": "text/html;charset=utf-8" }); res.end(html); });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const tabela = page.getByRole("table");
  await expect(tabela.getByText("#4551")).toHaveCount(3);
  await expect(tabela.getByText("Texto não registrado nesta decisão.")).toHaveCount(1);
  await expect(tabela.getByText("Resposta da Nina conferida (antes do envio)")).toBeVisible();
  const primeira = tabela.locator("tbody tr").nth(0);
  await primeira.getByText("ID da conversa", { exact: true }).click();
  await expect(primeira.getByText("11111111-1111-4111-8111-111111111111")).toBeVisible();
  await primeira.getByText("Ver texto registrado", { exact: true }).click();
  await expect(primeira.locator("details[open]").last()).toContainText("<script>alert(1)</script>");
  await primeira.getByText("Leitura ampliada · orienta a resposta", { exact: true }).click();
  await expect(primeira.getByText("Orientação preparada para a Nina neste turno.", { exact: true })).toBeVisible();
  await primeira.getByText("Ver orientação do turno", { exact: true }).click();
  await expect(primeira.getByText(/Responda a cada pedido na mesma resposta/)).toBeVisible();
  await primeira.getByText("Ver orientação do turno", { exact: true }).click();
  const antiga = tabela.locator("tbody tr").nth(2);
  await antiga.getByText("Leitura ampliada · em observação", { exact: true }).click();
  await expect(antiga.getByText("Não aplicada ao atendimento.", { exact: true })).toBeVisible();
  await expect(primeira.getByText("2 pedido(s) indicado(s): Preço; Dias / horários habituais do profissional.", { exact: true })).toBeVisible();
  await expect(primeira.getByText("Não indicado · 1%", { exact: true })).toBeVisible();
  await expect(primeira.getByText("Correção da especialidade · 65% · Incerto", { exact: true })).toHaveCount(1);
  await expect(primeira.getByText(/Leitura incompleta:/)).toBeVisible();
  const ultima = tabela.locator("tbody tr").last();
  await ultima.getByText("Ver texto registrado", { exact: true }).click();
  await expect(ultima.getByText("Registro parcial: primeiros 6.000 caracteres.")).toBeVisible();
  const consultas = await page.evaluate(() => globalThis.consultas);
  const lookup = consultas.filter((q) => q.tabela === "atend_conversas");
  expect(lookup).toHaveLength(1);
  expect(lookup[0].ids).toEqual(["11111111-1111-4111-8111-111111111111"]);
  expect(lookup[0].filtros).toContainEqual(["clinica_id", "clinica-teste"]);
  await ultima.getByText("Ver texto registrado", { exact: true }).click();
  await tabela.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(out, "jev-auditoria-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(392);
  await page.screenshot({ path: path.join(out, "jev-auditoria-mobile.png"), fullPage: true });
  expect(errors).toEqual([]);
  console.log("OK: tela real, orientação ativa, registro antigo em observação, conversa/UUID, mensagem, múltiplos pedidos, habitual/vagas, incerteza, leitura incompleta, consulta em lote e mobile.");
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
