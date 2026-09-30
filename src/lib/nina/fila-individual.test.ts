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
