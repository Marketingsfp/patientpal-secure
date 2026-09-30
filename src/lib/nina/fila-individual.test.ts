import { describe, expect, test } from "bun:test";
import { poolElegivel, simularAtribuicao, simularFila, verificarElegibilidade, type CandidatoDistribuicao } from "./telefonia-elegibilidade";
import { criteriosDeAtribuicao, verificarAtribuicao } from "./atribuicao-assertions";
import { conversaVisivelNoEscopo, usuarioPodeVerConversa } from "../atendimento/escopo-inbox";
import { patchListaPorConversa } from "../atendimento/patch-inbox";
import { escopoParaConversa } from "../atendimento/deep-link";

const agent = (id: string, status: "ONLINE" | "PAUSA" | "PAUSA_SAIDA" | "OFFLINE", extra: Partial<CandidatoDistribuicao> = {}): CandidatoDistribuicao => ({
  userId: id, status, temTelefonia: true, ...extra,
});

describe("distribuição só para Online e fila global sem dono", () => {
  test("pausas e offline nunca entram no pool; desempate usa carga, última atribuição e id", () => {
    expect(poolElegivel([agent("online", "ONLINE", { cargaAtiva: 5 }), agent("pausa", "PAUSA"), agent("saida", "PAUSA_SAIDA")]).map(c => c.userId)).toEqual(["online"]);
    expect(poolElegivel([agent("a", "ONLINE", { cargaAtiva: 4 }), agent("b", "ONLINE", { cargaAtiva: 3 })])[0].userId).toBe("b");
    expect(poolElegivel([agent("a", "ONLINE", { ultimaAtribuicaoEm: "2026-09-17T12:00:00Z" }), agent("b", "ONLINE", { ultimaAtribuicaoEm: "2026-09-17T11:00:00Z" })])[0].userId).toBe("b");
  });
  test("duas pausas não recebem nada; tudo fica na fila global até alguém ficar Online", () => {
    const r = simularFila([agent("a", "PAUSA"), agent("b", "PAUSA_SAIDA"), agent("c", "OFFLINE")], 25);
    expect(r.atribuicoes.every(x => x === null)).toBe(true);
    expect(r.naoAtribuidas).toBe(25);
  });
  test("Online recebe sem limite, sem teto de reservas", () => {
    expect(simularFila([agent("a", "ONLINE", { cargaAtiva: 100, capacidadeMaxima: 1 })], 35).naoAtribuidas).toBe(0);
    expect(verificarElegibilidade(agent("b", "PAUSA", { cargaAtiva: 0 })).eligible_for_nina_handoff).toBe(false);
  });
  test("revalidação: quem entra em Pausa, Pausa para saída ou Offline antes de gravar é descartado", () => {
    for (const novo of ["PAUSA", "PAUSA_SAIDA", "OFFLINE"] as const)
      expect(simularAtribuicao([agent("a", "ONLINE")], { revalidar: () => agent("a", novo) }).destino).toBe("nao_atribuidas");
    expect(simularAtribuicao([agent("a", "ONLINE")]).destino).toBe("atribuida");
  });
  test("auditoria aceita reserva em Pausa sem afirmar que estava Online", () => {
    const audit = {
      conversation_id: "c", selected_user_id: "a", estado_manual: "PAUSA", presence_status: "BUSY",
      destino: "fila_individual", assigned_at: "2026-09-17T12:00:00Z", assignment_method: "distribuicao_automatica",
      candidates_evaluated: [{ user_id: "a", perfil_telefonia: true, estado_manual: "PAUSA", presence_status: "BUSY", em_pausa: true, admin: false, elegivel: true, motivo_exclusao: null }],
    };
    const r = verificarAtribuicao(audit);
    expect(r.assigned_user_online).toBe(false);
    expect(r.assigned_user_eligible).toBe(true);
    expect(criteriosDeAtribuicao(r).every(c => c.ok)).toBe(true);
    expect(verificarAtribuicao({ ...audit, destino: "ativas" }).falhas).not.toHaveLength(0);
  });
});

describe("visibilidade da fila global (sem responsável)", () => {
  const dela = { id: "c", atribuida_user_id: "a", status: "waiting", owner_type: "HUMAN" };
  const global = { id: "g", atribuida_user_id: null, status: "waiting", owner_type: "NONE" };
  test("conversa com dono é só da pessoa (e da gestão) no acesso, no link e nos filtros", () => {
    expect(usuarioPodeVerConversa(dela, { userId: "a", gestor: false })).toBe(true);
    expect(usuarioPodeVerConversa(dela, { userId: "b", gestor: false })).toBe(false);
    expect(usuarioPodeVerConversa(dela, { userId: "b", gestor: true })).toBe(true);
    expect(escopoParaConversa(dela, { userId: "a", gestor: false, escopoAtual: "minhas" })).toBe("minhas");
    expect(conversaVisivelNoEscopo(dela, { userId: "a", gestor: false, escopo: "minhas" })).toBe(true);
  });
  test("a fila global sem responsável é só da gestão", () => {
    expect(conversaVisivelNoEscopo(global, { userId: "a", gestor: true, escopo: "nao_atribuidas" })).toBe(true);
    expect(conversaVisivelNoEscopo(global, { userId: "a", gestor: false, escopo: "nao_atribuidas" })).toBe(false);
    expect(usuarioPodeVerConversa(global, { userId: "a", gestor: false })).toBe(false);
    expect(escopoParaConversa(global, { userId: "a", gestor: false, escopoAtual: "minhas" })).toBeNull();
  });
  test("ao ser distribuída a alguém Online, a conversa sai da global e entra direto em Ativas", () => {
    const distribuida = { ...global, atribuida_user_id: "a", status: "active", owner_type: "HUMAN" };
    const ctx = { userId: "a", gestor: false, buscando: false };
    expect(patchListaPorConversa([global], distribuida, { ...ctx, gestor: true, escopo: "nao_atribuidas", userId: "gestor" }).lista).toHaveLength(0);
    expect(patchListaPorConversa([], distribuida, { ...ctx, escopo: "minhas" }).lista).toHaveLength(1);
  });
});
