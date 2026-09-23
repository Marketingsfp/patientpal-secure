/** bun scripts/test-catalogo-edicao-ui.ts
 * Componente real + serviços simulados. Sem autenticação, banco ou chamada paga de IA.
 */
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();
const saida = resolve(root, "outputs/catalogo-edicao");
await mkdir(saida, { recursive: true });
const servicosSimulados = `
import { aplicarEdicaoCatalogoIA } from "@/lib/nina/catalogo-edicao-ia";
const id = "22222222-2222-4222-8222-222222222222";
const servico = { id, nome: "Mamografia", valor: 160, preparo: "Trazer exames anteriores.", status: "PUBLICADO",
  updated_at: "2026-09-17T12:00:00+00:00", formas_pagamento: [{forma:"Dinheiro",valor:160},{forma:"Cartão",valor:200,condicao:"Em 2x"}] };
const profissional = { id, nome: "Dra. Ana", status: "PUBLICADO", updated_at: servico.updated_at,
  especialidades:[{id:null,nome:"Cardiologia"}], horarios:[{dia:"Quinta-feira",inicio:"14:00",fim:"18:00",recorrencia:"Quinzenal"}] };
const estado = window.__catalogoTeste = { saves: [], previews: 0, esperar: false, falhar: false, resolver: null };
export const listarCatalogoNina = async () => ({ servicos: [servico], profissionais: [profissional] });
export const opcoesCatalogoNina = async () => ({ procedimentos:[],medicos:[],especialidades:[],unidades:[],convenios:[] });
export const preverEdicaoCatalogoIA = async ({data}) => {
  estado.previews++;
  if (estado.esperar) await new Promise(resolve => { estado.resolver = resolve; });
  const registro = data.tipo === "servico" ? servico : profissional;
  const alteracao = data.tipo === "servico" ? { caminho:"/formas_pagamento/0/valor",valor_json:"180" } : { caminho:"/horarios/0/inicio",valor_json:'"14:30"' };
  const previa = aplicarEdicaoCatalogoIA(data.tipo, registro, { alteracoes:[{operacao:"definir",...alteracao}],pendencias:[],ambiguidades:[] });
  return {...previa,id,nome:registro.nome,tipo:data.tipo,esperadoUpdatedAt:registro.updated_at,incluiRascunho:false};
};
export const salvarServicoCatalogo = async ({data}) => {
  if (estado.falhar) throw new Error("Este cadastro mudou depois da prévia. Gere uma nova prévia antes de publicar.");
  estado.saves.push(data); return {id,status:"PUBLICADO",emRevisao:false};
};
export const salvarProfissionalCatalogo = salvarServicoCatalogo;
export const selecionarEdicoesCatalogoIA = async ({data}) => data.texto.includes("ambiguo")
  ? {itens:[],esclarecimentos:["Cardiologia de qual médico e forma de pagamento?"]}
  : {itens:[{id,tipo:"servico",nome:servico.nome,pedido:"Altere o dinheiro da mamografia para 180."},{id,tipo:"profissional",nome:profissional.nome,pedido:"Altere a quinta-feira para 14:30."}],esclarecimentos:[]};
export const publicarEdicoesCatalogoIA = async ({data}) => {
  if (estado.falhar) throw new Error("Este cadastro mudou depois da prévia. Gere uma nova prévia antes de publicar.");
  data.itens.forEach(item => estado.saves.push(item));
  return {publicados:data.itens.map(i=>i.tipo+":"+i.id),falha:null};
};
export const organizarTextoCatalogoIA = async () => ({ servicos:[{nome:"Exame criado por IA",valor:100}],profissionais:[],pendencias:[],ambiguidades:[] });
export const alterarStatusCatalogo = async () => { throw new Error("Fora do teste"); };
export const excluirItemCatalogo = alterarStatusCatalogo;
`;
const app = `
import React from "react";
import { createRoot } from "react-dom/client";
import { CatalogoNina } from "@/components/nina/catalogo/CatalogoNina";
import { Toaster } from "sonner";
const query = new URLSearchParams(location.search);
createRoot(document.getElementById("root")).render(<main className="p-6"><CatalogoNina
  clinicaId="11111111-1111-4111-8111-111111111111" podeEditar={!query.has("leitura")}
  tipo={query.has("profissional") ? "profissional" : "servico"} /><Toaster /></main>);
`;
const resultado = await Bun.build({
  entrypoints: ["catalogo-ui-entry"],
  target: "browser",
  format: "esm",
  define: { "process.env.NODE_ENV": '"development"' },
  plugins: [
    {
      name: "isolamento-catalogo",
      setup(build) {
        build.onResolve({ filter: /^catalogo-ui-entry$/ }, () => ({
          path: "entry",
          namespace: "fixture",
        }));
        build.onResolve({ filter: /catalogo\.functions$/ }, () => ({
          path: "functions",
          namespace: "fixture",
        }));
        build.onResolve({ filter: /^@tanstack\/react-start$/ }, () => ({
          path: "start",
          namespace: "fixture",
        }));
        build.onResolve({ filter: /webmcp\/atualizacao$/ }, () => ({
          path: "webmcp",
          namespace: "fixture",
        }));
        build.onLoad({ filter: /.*/, namespace: "fixture" }, (args) => ({
          contents:
            args.path === "entry"
              ? app
              : args.path === "functions"
                ? servicosSimulados
                : args.path === "start"
                  ? "export const useServerFn = fn => fn;"
                  : "export const assinarAtualizacao = () => () => {};",
          loader: "tsx",
          resolveDir: root,
        }));
      },
    },
  ],
});
if (!resultado.success) throw new Error(resultado.logs.join("\n"));
console.log("Componente compilado para teste isolado.");
const compilador = await compile(await Bun.file(resolve(root, "src/styles.css")).text(), {
  base: resolve(root, "src"),
  onDependency() {},
});
const scanner = new Scanner({
  sources: [{ base: resolve(root, "src"), pattern: "**/*.{ts,tsx}", negated: false }],
});
const css = compilador.build(scanner.scan());
console.log("Estilos do projeto compilados.");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 0,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/app.js")
      return new Response(resultado.outputs[0], { headers: { "Content-Type": "text/javascript" } });
    if (path === "/app.css") return new Response(css, { headers: { "Content-Type": "text/css" } });
    return new Response(
      '<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body><div id="root"></div><script type="module" src="/app.js"></script></body></html>',
      { headers: { "Content-Type": "text/html" } },
    );
  },
});
try {
  if (process.env["CATALOGO_UI_SERVE_ONLY"] === "1") {
    console.log(`Prévia local: ${server.url}`);
    await new Promise(() => {});
  }
  const teste = Bun.spawn(
    ["node", resolve(root, "scripts/fixtures/catalogo-edicao-ui.mjs"), String(server.url), saida],
    { stdout: "inherit", stderr: "inherit" },
  );
  if ((await teste.exited) !== 0) throw new Error("A validação visual do catálogo falhou.");
} finally {
  server.stop(true);
}
