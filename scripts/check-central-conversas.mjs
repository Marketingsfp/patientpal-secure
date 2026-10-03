// UI real da Central; transporte e chat simulados. Não acessa pacientes/serviços.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium, expect } from "@playwright/test";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import path from "node:path";

const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const fixtures = {
  "@tanstack/react-start": "export const useServerFn = fn => fn;",
  "@/hooks/use-clinica":
    "export const useClinica = () => ({clinicaAtual:{clinica_id:'clinica-teste'}});",
  "@/lib/atendimento.functions": `
    const rows = Array.from({length:54}, (_,i)=>({id:'conversa-'+i,
      contato_nome:'Paciente fictício '+i,contato_telefone:'000000000',
      numero_conversa:1000+i,protocolo_atendimento:'TESTE-'+i,
      status:i%2?'closed':'active',ultima_msg_em:'2026-10-03T12:00:00Z',trecho:null}));
    export async function listarCentralConversas({data}) {
      if(window.falharLista) throw Error('Falha simulada de acesso');
      await new Promise(r=>setTimeout(r,data.situacao==='abertas'?100:10));
      const filtradas=rows.filter(c=>data.situacao==='todas'||(c.status==='closed')===(data.situacao==='encerradas'));
      return {conversas:filtradas.slice(data.offset,data.offset+data.limit),temMais:filtradas.length>data.offset+data.limit};
    }
    export async function pesquisarConversasGeral({data}) {
      return rows.filter(c=>c.contato_nome.toLowerCase().includes(data.termo.toLowerCase())).map(c=>({...c,trecho:'Mensagem fictícia encontrada'}));
    }
  `,
  "./AtendimentoExtraTabs": `
    import React from 'react';
    export function AtendInbox({modoCentral,conversaIdExterna,onSelecionarConversa}) {
      if(!modoCentral) throw Error('Chat sem modo Central');
      return <div className="h-full p-3" data-chat-id={conversaIdExterna}>
        <h3>Chat simulado · {conversaIdExterna}</h3>
        <p>Abertura do chat compartilhado, sem mudar de aba.</p>
        <button onClick={()=>onSelecionarConversa('conversa-2')}>Simular seleção interna</button>
      </div>;
    }
  `,
};
const bundle = await build({
  stdin: {
    contents: `import React from 'react';import {createRoot} from 'react-dom/client';
      import {PesquisaConversas} from './src/components/nina/PesquisaConversas';
      createRoot(document.getElementById('root')).render(<div data-os-zap="true" className="h-dvh"><PesquisaConversas/></div>);`,
    resolveDir: process.cwd(),
    loader: "tsx",
  },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "central-fixtures",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          args.path in fixtures ? { path: args.path, namespace: "fixture" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents: fixtures[args.path],
          loader: "tsx",
          resolveDir: process.cwd(),
        }));
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
  css.build([...scanner.scan(), "h-dvh", "p-3"]) +
  (await readFile("src/components/nina/os-zap.css", "utf8"));
const file = path.join(out, "central.html");
await writeFile(
  file,
  `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${styles}</style></head><body><div id="root"></div><script>${bundle.outputFiles[0].text}</script></body></html>`,
);
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const url = pathToFileURL(file).href + "#atend-pesquisa-conversas";
  await page.goto(url);
  const cards = page.locator("[data-conversa-id]");
  await expect(cards).toHaveCount(50);
  await expect(cards.filter({ hasText: "Encerrada" })).toHaveCount(25);
  await page.getByRole("button", { name: "Carregar mais conversas" }).click();
  await expect(cards).toHaveCount(54);
  await page.locator('[data-conversa-id="conversa-1"]').click();
  await expect(page.locator("[data-chat-id]")).toHaveAttribute("data-chat-id", "conversa-1");
  await expect(page).toHaveURL(url);
  await page.getByRole("button", { name: "Simular seleção interna" }).click();
  await expect(page.locator('[data-conversa-id="conversa-2"]')).toHaveAttribute(
    "aria-current",
    "true",
  );
  const filtro = page.getByLabel("Situação das conversas");
  await filtro.selectOption("encerradas");
  await expect(cards).toHaveCount(27);
  await expect(cards.filter({ hasText: "Encerrada" })).toHaveCount(27);
  // Requisição antiga e lenta não pode substituir o filtro mais recente.
  await filtro.selectOption("abertas");
  await filtro.selectOption("encerradas");
  await expect(cards).toHaveCount(27);
  await page.waitForTimeout(150);
  await expect(cards.filter({ hasText: "Encerrada" })).toHaveCount(27);
  await filtro.selectOption("todas");
  await page.getByLabel("Pesquisar na central de conversas").fill("Paciente fictício 53");
  await page.getByRole("button", { name: "Buscar", exact: true }).click();
  await expect(cards).toHaveCount(1);
  await expect(cards).toContainText("Mensagem fictícia encontrada");
  await page.getByRole("button", { name: "Limpar busca" }).click();
  await expect(cards).toHaveCount(50);
  await page.screenshot({ path: path.join(out, "central-desktop.png") });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("button", { name: "Voltar à lista" })).toBeVisible();
  await expect(page.locator(".oszap-central-list")).toBeHidden();
  await page.getByRole("button", { name: "Voltar à lista" }).click();
  await expect(page.locator(".oszap-central-list")).toBeVisible();
  await page.locator('[data-conversa-id="conversa-1"]').click();
  await expect(page.locator("[data-chat-id]")).toHaveAttribute("data-chat-id", "conversa-1");
  await expect(page).toHaveURL(url);
  await page.screenshot({ path: path.join(out, "central-mobile.png") });
  if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth))
    throw Error("Overflow no celular");
  await page.getByRole("button", { name: "Voltar à lista" }).click();
  await page.evaluate(() => {
    window.falharLista = true;
  });
  await page.getByLabel("Atualizar lista de conversas").click();
  await expect(page.getByRole("alert")).toHaveText("Falha simulada de acesso");
  if (errors.length) throw Error(errors.join("\n"));
  console.log(
    "Central: paginação, abertas/encerradas, seleção sem navegação, sincronização, busca, requisições concorrentes, celular e erro: OK (serviços simulados).",
  );
} finally {
  await browser.close();
}
