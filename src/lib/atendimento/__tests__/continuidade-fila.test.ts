import { describe, expect, it } from "bun:test";
import {
  chatContinuaAposPrimeiraResposta,
  filtrarPorEscopo,
  podeRevalidarChatDaFila,
  selecaoDeveSair,
  type ContextoEscopo,
} from "../inbox-cache";
import { patchListaPorConversa } from "../patch-inbox";

const ctx: ContextoEscopo = { clinicaId: "clinica-a", userId: "ana", gestor: false, escopo: "nao_atribuidas" };
const fila = {
  id: "conversa-a", clinica_id: "clinica-a", is_teste: false,
  atribuida_user_id: "ana", owner_type: "HUMAN", status: "waiting", fila_pendente: true,
};
const ativa = { ...fila, status: "active", fila_pendente: false };

describe("continuidade da própria conversa após responder na fila individual", () => {
  it("o card passa para Ativas, mas a seleção pode continuar no filtro Não atribuídas", () => {
    const pendentes = patchListaPorConversa([fila], ativa, { ...ctx, userId: "ana" }).lista;
    expect(pendentes).toEqual([]);
    expect(filtrarPorEscopo([ativa], { ...ctx, escopo: "minhas" })).toEqual([ativa]);
    expect(selecaoDeveSair({ selecionada: fila, linhas: pendentes, buscando: false, ctx, confirmadaForaLista: ativa })).toBe(false);
    expect(ctx.escopo).toBe("nao_atribuidas");
  });

  it("continua aberta nas reconciliações seguintes, mesmo sem card na lista atual", () => {
    expect(chatContinuaAposPrimeiraResposta({ selecionada: fila, confirmada: ativa, ctx })).toBe(true);
    expect(selecaoDeveSair({ selecionada: ativa, linhas: [], buscando: false, ctx, confirmadaForaLista: ativa })).toBe(false);
  });

  it("conversa ainda pendente permanece na fila; ausência sem confirmação não mantém o chat", () => {
    expect(selecaoDeveSair({ selecionada: fila, linhas: [fila], buscando: false, ctx })).toBe(false);
    expect(filtrarPorEscopo([fila], ctx)).toEqual([fila]);
    expect(filtrarPorEscopo([fila], { ...ctx, escopo: "minhas" })).toEqual([]);
    expect(chatContinuaAposPrimeiraResposta({ selecionada: fila, confirmada: fila, ctx })).toBe(false);
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx })).toBe(true);
  });

  it.each([
    ["outro responsável", { ...ativa, atribuida_user_id: "bia" }],
    ["devolução global", { ...ativa, atribuida_user_id: null, owner_type: "NONE" }],
    ["Nina", { ...ativa, owner_type: "AI" }],
    ["fechamento", { ...ativa, status: "closed" }],
    ["finalização", { ...ativa, status: "finished" }],
    ["outra clínica", { ...ativa, clinica_id: "clinica-b" }],
    ["outra conversa", { ...ativa, id: "conversa-b" }],
    ["homologação", { ...ativa, is_teste: true }],
    ["registro incompleto", { ...ativa, fila_pendente: undefined }],
    ["acesso negado ou inexistente", null],
  ])("%s não mantém uma seleção fora do filtro", (_motivo, confirmada) => {
    expect(selecaoDeveSair({ selecionada: fila, linhas: [], buscando: false, ctx, confirmadaForaLista: confirmada })).toBe(true);
  });

  it.each([
    { ...ctx, userId: "bia" },
    { ...ctx, clinicaId: "clinica-b" },
    { ...ctx, clinicaId: null },
    { ...ctx, gestor: true },
    { ...ctx, escopo: "fechadas" as const },
    { ...ctx, escopo: "nina" as const },
  ])("mudança de perfil, clínica ou filtro não reaproveita a continuidade: %j", (contexto) => {
    expect(podeRevalidarChatDaFila(fila, contexto)).toBe(false);
    expect(chatContinuaAposPrimeiraResposta({ selecionada: fila, confirmada: ativa, ctx: contexto })).toBe(false);
  });
});
