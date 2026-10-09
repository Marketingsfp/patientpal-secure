import { expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { incorporarEsperaDaLista, mesclarListaConversas } from "../inbox-merge";

// Executa o callback real da Inbox com transporte controlado, sem copiar sua implementação.
const fonte = readFileSync(
  new URL("../../../components/nina/AtendimentoExtraTabs.tsx", import.meta.url),
  "utf8",
);
const ast = ts.createSourceFile(
  "inbox.tsx",
  fonte,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
let callback = "";
function visitar(n: ts.Node) {
  if (
    ts.isVariableDeclaration(n) &&
    n.name.getText(ast) === "carregarConvs" &&
    n.initializer &&
    ts.isCallExpression(n.initializer)
  )
    callback = n.initializer.arguments[0].getText(ast);
  ts.forEachChild(n, visitar);
}
visitar(ast);
if (!callback) throw Error("Callback da lista não encontrado");
const js = ts.transpile(`globalThis.executar = (${callback});`, { target: ts.ScriptTarget.ES2022 });
function ambiente() {
  let rows: { id: string }[] = [];
  let carregando = false;
  const consultas: ((rows: { id: string; aguardando_desde?: string }[]) => void)[] = [];
  let liberarChat!: (v: unknown) => void;
  const chat = new Promise((resolve) => {
    liberarChat = resolve;
  });
  const ctx = {
    clinicaId: "clinica",
    modoCentral: false,
    meuId: "u",
    filtroStatus: "all",
    escopo: "minhas",
    atendenteSelecionadoId: null,
    visualizacao: "espera",
    souGestor: false,
    mostrarTestes: false,
    seqConvs: { current: 0 },
    chaveAtualRef: { current: "espera" },
    chaveInbox: (p: { visualizacao: string }) => p.visualizacao,
    setCarregandoLista: (v: boolean) => {
      carregando = v;
    },
    setErroPaginaConvs() {},
    setTemMaisConvs() {},
    listarConvs: () => new Promise((resolve) => consultas.push(resolve)),
    medirRequest: (_n: string, p: unknown) => p,
    filtrarPorEscopo: (r: unknown) => r,
    aberturasConfirmadasRef: { current: new Map() },
    entradaAtendimento: () => "entrada",
    incorporarEsperaDaLista,
    mesclarListaConversas,
    seqEspera: { current: 0 },
    esperaRef: { current: {} },
    setEspera: (f: (anterior: Record<string, string>) => Record<string, string>) => {
      ctx.esperaRef.current = f(ctx.esperaRef.current);
    },
    setConvs: (f: (p: { id: string }[]) => { id: string }[]) => {
      rows = f(rows);
    },
    conversasDesatualizadas: () => [],
    idsQueSairam: () => [],
    cacheConversas: { current: { chaves: () => [], invalidar() {} } },
    prefetchMsgs: { current: { invalidar() {} } },
    selIdRef: { current: "aberta" },
    selecaoIdRef: { current: "aberta" },
    selRef: { current: { id: "aberta" } },
    podeRevalidarChatEntreFiltros: () => true,
    revalidarChatSelecionado: (f: () => unknown) => f(),
    obterConversaFn: () => chat,
    deepLinkPendente: { current: null },
    selecaoDeveSair: () => false,
    setSel() {},
    devoAutoSelecionarComSelecao: () => false,
    devoAutoSelecionar: () => false,
    carregarContadores() {},
    mostrarErro(e: unknown) {
      throw e;
    },
    executar: () => Promise.resolve(),
  };
  runInNewContext(js, ctx);
  return {
    ctx,
    consultas,
    liberarChat,
    get rows() {
      return rows;
    },
    get carregando() {
      return carregando;
    },
  };
}
it("cards de Pendentes aparecem antes da revalidação lenta do chat e sem outra consulta de espera", async () => {
  const a = ambiente();
  const p = a.ctx.executar();
  expect(a.carregando).toBe(true);
  a.consultas[0]([{ id: "pendente", aguardando_desde: "2026-10-03T12:00:00Z" }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(a.rows.map((r) => r.id)).toEqual(["pendente"]);
  expect(a.carregando).toBe(false);
  expect(a.ctx.esperaRef.current).toEqual({ pendente: "2026-10-03T12:00:00Z" });
  a.liberarChat(null);
  await p;
});
it("resposta atrasada de Pendentes não substitui os cards de Fechadas", async () => {
  const a = ambiente();
  const antiga = a.ctx.executar();
  a.ctx.visualizacao = "resolvidas";
  a.ctx.chaveAtualRef.current = "resolvidas";
  const nova = a.ctx.executar();
  a.consultas[1]([{ id: "fechada" }]);
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(a.rows.map((r) => r.id)).toEqual(["fechada"]);
  a.consultas[0]([{ id: "pendente" }]);
  await antiga;
  expect(a.rows.map((r) => r.id)).toEqual(["fechada"]);
  a.liberarChat(null);
  await nova;
});
