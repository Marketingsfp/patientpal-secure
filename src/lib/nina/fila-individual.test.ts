import { describe, expect, test } from "bun:test";
import { poolElegivel, simularAtribuicao, simularFila, verificarElegibilidade, type CandidatoDistribuicao } from "./telefonia-elegibilidade";
import { criteriosDeAtribuicao, verificarAtribuicao } from "./atribuicao-assertions";
import { conversaVisivelNoEscopo, usuarioPodeVerConversa } from "../atendimento/escopo-inbox";
import { patchListaPorConversa } from "../atendimento/patch-inbox";
import { escopoParaConversa } from "../atendimento/deep-link";

const agent = (id: string, status: "ONLINE" | "PAUSA" | "OFFLINE", extra: Partial<CandidatoDistribuicao> = {}): CandidatoDistribuicao => ({
  userId: id, status, temTelefonia: true, ...extra,
});

describe("distribuição Online/Pausa e fila global", () => {
  test("não prioriza Online; desempate usa carga, última atribuição e id", () => {
    expect(poolElegivel([agent("online", "ONLINE", { cargaAtiva: 5 }), agent("pausa", "PAUSA", { cargaNaoAtribuida: 2 })])[0].userId).toBe("pausa");
    expect(poolElegivel([agent("online", "ONLINE", { cargaAtiva: 4 }), agent("pausa", "PAUSA", { cargaAtiva: 3, cargaNaoAtribuida: 2 })])[0].userId).toBe("online");
    expect(poolElegivel([agent("a", "ONLINE", { ultimaAtribuicaoEm: "2026-09-17T12:00:00Z" }), agent("b", "PAUSA", { ultimaAtribuicaoEm: "2026-09-17T11:00:00Z" })])[0].userId).toBe("b");
  });
  test("duas pausas recebem 10 cada; sobra fica global e Offline não participa", () => {
    const r = simularFila([agent("a", "PAUSA"), agent("b", "PAUSA"), agent("c", "OFFLINE")], 25);
    expect(r.atribuicoes.filter(x => x === "a")).toHaveLength(10);
    expect(r.atribuicoes.filter(x => x === "b")).toHaveLength(10);
    expect(r.atribuicoes).not.toContain("c");
    expect(r.naoAtribuidas).toBe(5);
  });
  test("Online recebe sem limite; teto da Pausa usa apenas as reservas", () => {
    expect(simularFila([agent("a", "ONLINE", { cargaAtiva: 100, capacidadeMaxima: 1 })], 35).naoAtribuidas).toBe(0);
    expect(verificarElegibilidade(agent("b", "PAUSA", { cargaAtiva: 100, cargaNaoAtribuida: 9 })).eligible_for_nina_handoff).toBe(true);
    expect(verificarElegibilidade(agent("b", "PAUSA", { cargaNaoAtribuida: 10 })).eligible_for_nina_handoff).toBe(false);
  });
  test("revalidação muda o destino ao entrar em Pausa e recusa Offline", () => {
    expect(simularAtribuicao([agent("a", "ONLINE")], { revalidar: () => agent("a", "PAUSA") }).destino).toBe("fila_individual");
    expect(simularAtribuicao([agent("a", "ONLINE")], { revalidar: () => agent("a", "OFFLINE") }).destino).toBe("nao_atribuidas");
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

describe("visibilidade da fila individual", () => {
  const own = { id: "c", atribuida_user_id: "a", fila_pendente: true, status: "waiting", owner_type: "HUMAN" };
  test("reserva fica privada no acesso, no link e nos filtros", () => {
    expect(usuarioPodeVerConversa(own, { userId: "a", gestor: false })).toBe(true);
    expect(usuarioPodeVerConversa(own, { userId: "b", gestor: false })).toBe(false);
    expect(usuarioPodeVerConversa(own, { userId: "b", gestor: true })).toBe(true);
    expect(escopoParaConversa(own, { userId: "a", gestor: false, escopoAtual: "minhas" })).toBe("nao_atribuidas");
    expect(conversaVisivelNoEscopo(own, { userId: "a", gestor: false, escopo: "minhas" })).toBe(false);
  });
  test("supervisão vê o excedente global; atendente vê apenas suas reservas", () => {
    const global = { ...own, atribuida_user_id: null, fila_pendente: false };
    expect(conversaVisivelNoEscopo(global, { userId: "a", gestor: true, escopo: "nao_atribuidas" })).toBe(true);
    expect(conversaVisivelNoEscopo(global, { userId: "a", gestor: false, escopo: "nao_atribuidas" })).toBe(false);
  });
  test("primeira resposta remove da fila e entra em Ativas mesmo se status já era active", () => {
    const before = { ...own, status: "active" };
    const after = { ...before, fila_pendente: false };
    const ctx = { userId: "a", gestor: false, buscando: false };
    expect(patchListaPorConversa([before], after, { ...ctx, escopo: "nao_atribuidas" }).lista).toHaveLength(0);
    expect(patchListaPorConversa([], after, { ...ctx, escopo: "minhas" }).lista).toHaveLength(1);
  });
});
