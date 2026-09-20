import { describe, expect, it } from "bun:test";
import {
  chatContinuaEntreFiltros,
  filtrarPorEscopo,
  podeRevalidarChatEntreFiltros,
  selecaoDeveSair,
  revalidarChatSelecionado,
  type ContextoEscopo,
} from "../inbox-cache";
import { patchListaPorConversa } from "../patch-inbox";
import { estadoFiltroAtendente, type FiltroAtendente } from "../filtros-atendente";
import { escopoConsulta } from "../filtros-inbox";

const ctx: ContextoEscopo = { clinicaId: "clinica-a", userId: "ana", gestor: false, escopo: "nao_atribuidas" };
const fila = {
  id: "conversa-a", clinica_id: "clinica-a", is_teste: false,
  atribuida_user_id: "ana", owner_type: "HUMAN", status: "waiting", fila_pendente: true,
};
const ativa = { ...fila, status: "active", fila_pendente: false };
const fechada = {
  ...ativa, status: "closed", owner_type: "NONE", atribuida_user_id: null,
  last_assigned_user_id: "ana", resolved_by: "ana",
};
const filtros: FiltroAtendente[] = ["ativas", "nao_atribuidas", "fechadas"];
const contextoFiltro = (filtro: FiltroAtendente): ContextoEscopo => ({
  ...ctx,
  escopo: escopoConsulta({ ...estadoFiltroAtendente(filtro), gestor: false, meuId: ctx.userId }),
});

describe("continuidade da própria conversa após responder na fila individual", () => {
  it("o card passa para Ativas, mas a seleção pode continuar no filtro Não atribuídas", () => {
    const pendentes = patchListaPorConversa([fila], ativa, { ...ctx, userId: "ana" }).lista;
    expect(pendentes).toEqual([]);
    expect(filtrarPorEscopo([ativa], { ...ctx, escopo: "minhas" })).toEqual([ativa]);
    expect(selecaoDeveSair({ selecionada: fila, linhas: pendentes, buscando: false, ctx, confirmadaForaLista: ativa })).toBe(false);
    expect(ctx.escopo).toBe("nao_atribuidas");
  });

  it("continua aberta nas reconciliações seguintes, mesmo sem card na lista atual", () => {
    expect(chatContinuaEntreFiltros({ selecionada: fila, confirmada: ativa, ctx })).toBe(true);
    expect(selecaoDeveSair({ selecionada: ativa, linhas: [], buscando: false, ctx, confirmadaForaLista: ativa })).toBe(false);
  });

  it("conversa ainda pendente permanece aberta mesmo ausente da lista filtrada", () => {
    expect(selecaoDeveSair({ selecionada: fila, linhas: [fila], buscando: false, ctx })).toBe(false);
    expect(filtrarPorEscopo([fila], ctx)).toEqual([fila]);
    expect(filtrarPorEscopo([fila], { ...ctx, escopo: "minhas" })).toEqual([]);
    expect(chatContinuaEntreFiltros({ selecionada: fila, confirmada: fila, ctx })).toBe(true);
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx })).toBe(false);
  });

  it.each([
    ["outro responsável", { ...ativa, atribuida_user_id: "bia" }],
    ["devolução global", { ...ativa, atribuida_user_id: null, owner_type: "NONE" }],
    ["outra clínica", { ...ativa, clinica_id: "clinica-b" }],
    ["outra conversa", { ...ativa, id: "conversa-b" }],
    ["homologação", { ...ativa, is_teste: true }],
    ["acesso negado ou inexistente", null],
  ])("%s não mantém uma seleção fora do filtro", (_motivo, confirmada) => {
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx, confirmadaForaLista: confirmada })).toBe(true);
  });

  it.each([
    { ...ctx, userId: "bia" },
    { ...ctx, clinicaId: "clinica-b" },
    { ...ctx, clinicaId: null },
  ])("perda de contexto ou autorização não reaproveita a continuidade: %j", (contexto) => {
    expect(chatContinuaEntreFiltros({ selecionada: fila, confirmada: ativa, ctx: contexto })).toBe(false);
  });
});

describe("continuidade do chat nas três abas das atendentes", () => {
  for (const selecionada of [ativa, fila, fechada]) {
    for (const origem of filtros) {
      for (const destino of filtros.filter(filtro => filtro !== origem)) {
        it(`mantém a conversa ${selecionada.status} ao trocar ${origem} por ${destino}, mesmo com a lista vazia`, () => {
          for (const filtro of [origem, destino]) {
            const contexto = contextoFiltro(filtro);
            expect(podeRevalidarChatEntreFiltros(selecionada, contexto)).toBe(true);
            expect(selecaoDeveSair({
              selecionada, linhas: [], buscando: false, ctx: contexto,
              confirmadaForaLista: { ...selecionada },
            })).toBe(false);
          }
        });
      }
    }
  }

  it.each(filtros)("mantém só os cards da aba %s, sem inserir o chat preservado", filtro => {
    const contexto = contextoFiltro(filtro);
    const conversas = [
      { ...ativa, id: "ativa" }, { ...fila, id: "fila" }, { ...fechada, id: "fechada" },
    ];
    const linhas = filtrarPorEscopo(conversas, contexto);
    expect(linhas).toEqual([conversas[filtro === "ativas" ? 0 : filtro === "nao_atribuidas" ? 1 : 2]]);
    for (const selecionada of conversas) {
      expect(selecaoDeveSair({
        selecionada, linhas, buscando: false, ctx: contexto, confirmadaForaLista: selecionada,
      })).toBe(false);
    }
  });

  it.each(filtros)("lista vazia de %s não é prova de perda de acesso", filtro => {
    const contexto = contextoFiltro(filtro);
    for (const selecionada of [ativa, fila, fechada]) {
      expect(selecaoDeveSair({ selecionada, linhas: [], buscando: false, ctx: contexto })).toBe(false);
    }
  });

  it("continua exibindo uma finalizada vinculada à atendente que resolveu", () => {
    const finalizada = { ...fechada, status: "finished", last_assigned_user_id: null };
    expect(chatContinuaEntreFiltros({
      selecionada: finalizada, confirmada: finalizada, ctx: contextoFiltro("ativas"),
    })).toBe(true);
  });

  it.each(filtros)("perda de vínculo não preserva uma fechada fora de %s", filtro => {
    for (const confirmada of [
      { ...fechada, last_assigned_user_id: "bia", resolved_by: "bia" },
      { ...fechada, last_assigned_user_id: null, resolved_by: null },
      { ...fechada, clinica_id: "clinica-b" },
      { ...fechada, is_teste: true },
      { ...ativa, atribuida_user_id: "bia", last_assigned_user_id: "ana", resolved_by: "ana" },
    ]) {
      expect(selecaoDeveSair({
        selecionada: fechada, linhas: [], buscando: false, ctx: contextoFiltro(filtro), confirmadaForaLista: confirmada,
      })).toBe(true);
    }
  });

  it("confere a transferência mesmo com o card já fora da lista de Fechadas", () => {
    const contexto = contextoFiltro("fechadas");
    const transferida = { ...ativa, atribuida_user_id: "bia" };
    expect(patchListaPorConversa([], transferida, { ...contexto, userId: "ana" }).lista).toEqual([]);
    expect(podeRevalidarChatEntreFiltros(ativa, contexto)).toBe(true);
    expect(chatContinuaEntreFiltros({ selecionada: ativa, confirmada: transferida, ctx: contexto })).toBe(false);
    expect(selecaoDeveSair({
      selecionada: ativa, linhas: [], buscando: false, ctx: contexto, confirmadaForaLista: transferida,
    })).toBe(true);
  });

  it.each([
    { ...fila, owner_type: "NONE", status: "new" },
    { ...ativa, fila_pendente: undefined },
    fechada,
    { ...fechada, status: "finished" },
    { ...ativa, atribuida_user_id: null, owner_type: "AI" },
  ])("preserva estados acessíveis sem exigir o estado especial anterior: %j", confirmada => {
    expect(chatContinuaEntreFiltros({ selecionada: fila, confirmada, ctx: contextoFiltro("ativas") })).toBe(true);
  });

  it("reabrir uma conversa da própria atendente mantém o chat", () => {
    expect(chatContinuaEntreFiltros({ selecionada: fechada, confirmada: ativa, ctx })).toBe(true);
  });

  it("supervisão muda de filtro sem perder a conversa aberta", () => {
    const outra = { ...ativa, atribuida_user_id: "bia" };
    for (const escopo of ["minhas", "nao_atribuidas", "fechadas", "nina", "equipe"] as const) {
      const contexto = { ...ctx, gestor: true, escopo, atendenteId: "carla" };
      expect(podeRevalidarChatEntreFiltros(outra, contexto)).toBe(true);
      expect(selecaoDeveSair({ selecionada: outra, linhas: [], buscando: false, ctx: contexto, confirmadaForaLista: outra })).toBe(false);
    }
  });

  it("falha de rede ao sair de Não atribuídas para Ativas não limpa a conversa", async () => {
    const contexto = contextoFiltro("ativas");
    const confirmada = await revalidarChatSelecionado(() => Promise.reject(new Error("Failed to fetch")));
    expect(confirmada).toBeUndefined();
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx: contexto, confirmadaForaLista: confirmada })).toBe(false);
    expect(await revalidarChatSelecionado(() => Promise.resolve(ativa))).toEqual(ativa);
  });

  it.each([
    new Error("Você não possui permissão para visualizar esta conversa."),
    new Error("Conversa não encontrada."),
    { motivo: "CONVERSA_SEM_PERMISSAO", message: "Acesso negado" },
  ])("negativa explícita do servidor continua protegendo o acesso: %j", async erro => {
    const confirmada = await revalidarChatSelecionado(() => Promise.reject(erro));
    expect(confirmada).toBeNull();
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx, confirmadaForaLista: confirmada })).toBe(true);
  });
});
