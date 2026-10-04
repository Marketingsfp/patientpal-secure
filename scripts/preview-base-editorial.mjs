// Prévia local da tela real com dados fictícios. Não conecta banco nem modelo.
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const out = path.resolve("../oszap-design-preview");
await mkdir(out, { recursive: true });
const fixture = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {Toaster} from 'sonner';
import {BaseConhecimento} from './src/components/nina/BaseConhecimento';
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}><div className="p-5"><p className="mb-4 text-xs text-muted-foreground">PRÉVIA LOCAL · DADOS FICTÍCIOS · SEM BANCO OU IA</p><BaseConhecimento/></div><Toaster/></QueryClientProvider>);
`;
const functions = `
const registros={servicos:[{id:'22222222-2222-4222-8222-222222222222',nome:'Exame demonstrativo',status:'PUBLICADO',valor:100,formas_pagamento:[{forma:'Dinheiro',valor:100},{forma:'Pix/cartão',valor:120}],executantes:[],preparo:'Informação fictícia para testar o formulário.',updated_at:'2026-09-27T12:00:00Z'}],profissionais:[{id:'33333333-3333-4333-8333-333333333333',nome:'Profissional demonstrativo',status:'RASCUNHO',especialidades:[],horarios:[],formas_pagamento:[],updated_at:'2026-09-27T12:00:00Z'}]};
export async function listarCatalogoNina(){return structuredClone(registros)}
export async function opcoesCatalogoNina(){return {procedimentos:[],medicos:[],especialidades:[],unidades:[],convenios:[]}}
async function salvar(tipo,{data}){const lista=registros[tipo];const anterior=lista.find(x=>x.id===data.id);const registro={...anterior,...data.dados,id:data.id||crypto.randomUUID(),status:data.publicar?'PUBLICADO':'RASCUNHO'};if(anterior)Object.assign(anterior,registro);else lista.push(registro);return {id:registro.id,status:registro.status}}
export const salvarServicoCatalogo=x=>salvar('servicos',x);
export const salvarProfissionalCatalogo=x=>salvar('profissionais',x);
const indisponivel=async()=>{throw Error('Esta prévia não acessa banco ou modelo real.')};
export const alterarStatusCatalogo=indisponivel,excluirItemCatalogo=indisponivel,organizarTextoCatalogoIA=indisponivel,preverEdicaoCatalogoIA=indisponivel,selecionarEdicoesCatalogoIA=indisponivel,publicarEdicoesCatalogoIA=indisponivel;
`;
const mocks = {
  "@tanstack/react-start": "export const useServerFn=fn=>fn;",
  "@/hooks/use-clinica":
    "export const useClinica=()=>({clinicaAtual:{clinica_id:'11111111-1111-4111-8111-111111111111',role:'admin'}});",
  "@/lib/nina/catalogo.functions": functions,
  "@/lib/nina/horario-funcionamento.functions": `export const listarHorarioFuncionamento=async()=>({rascunho:null,vigente:null,versoes:[],hoje:'2026-10-04',role:'admin'});const proibido=()=>{throw Error('Horário protegido nesta prévia')};export const atualizarRascunhoHorario=proibido,criarRascunhoHorario=proibido,descartarRascunhoHorario=proibido,publicarHorario=proibido,removerExcecaoHorario=proibido,salvarDiaHorario=proibido,salvarExcecaoHorario=proibido;`,
};
const js = await build({
  stdin: { contents: fixture, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true,
  write: false,
  format: "iife",
  jsx: "automatic",
  define: { "process.env.NODE_ENV": '"production"' },
  plugins: [
    {
      name: "fixtures",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) =>
          a.path in mocks ? { path: a.path, namespace: "fixture" } : undefined,
        );
        b.onLoad({ filter: /.*/, namespace: "fixture" }, (a) => ({ contents: mocks[a.path] }));
      },
    },
  ],
});
const css = await compile(await readFile("src/styles.css", "utf8"), {
  base: path.resolve("src"),
  onDependency() {},
});
const styles = css.build(new Scanner({ sources: css.sources }).scan());
await writeFile(
  path.join(out, "base-editorial.html"),
  `<!doctype html><html lang="pt-BR" class="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Base editorial — prévia local</title><style>${styles}</style></head><body><div id="root"></div><script>${js.outputFiles[0].text.replaceAll("</script>", "<\\/script>")}</script></body></html>`,
);
console.log(path.join(out, "base-editorial.html"));
