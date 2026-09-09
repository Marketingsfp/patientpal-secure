/**
 * FASE 2 — cenários A–H da elegibilidade Telefonia.
 *
 * Os cenários usam exatamente o formato que `atend_pool_telefonia_avaliacao`
 * devolve (a MESMA avaliação usada por `atend_auto_assign_conversa` e pela
 * fila "Não atribuídas"). Aqui não existe segunda regra de elegibilidade:
 * o teste confere a leitura/decisão sobre esse resultado.
 */
import { describe, expect, it } from "bun:test";
import {
  verificarAtribuicao,
  resumoExclusoes,
  type CandidatoAvaliado,
} from "./atribuicao-assertions";

const base: CandidatoAvaliado = {
  user_id: "u",
  perfil_telefonia: true,
  presence_status: "ONLINE",
  aceita_novas: true,
  presenca_recente: true,
  em_pausa: false,
  admin: false,
  load_at_selection: 0,
  elegivel: true,
  motivo_exclusao: null,
};

const cand = (id: string, over: Partial<CandidatoAvaliado> = {}): CandidatoAvaliado => ({
  ...base,
  user_id: id,
  ...over,
});

const auditoria = (selecionado: string | null, candidatos: CandidatoAvaliado[]) => ({
  conversation_id: "c1",
  selected_user_id: selecionado,
  presence_status: "ONLINE",
  assignment_method: "auto_distribution",
  assigned_at: new Date().toISOString(),
  candidates_evaluated: candidatos,
});

describe("elegibilidade do perfil Telefonia", () => {
  it("A — Telefonia + Online entra no pool e pode ser atribuído", () => {
    const v = verificarAtribuicao(auditoria("u1", [cand("u1")]));
    expect(v.assigned_user_has_telefonia).toBe(true);
    expect(v.assigned_user_online).toBe(true);
    expect(v.assigned_user_admin).toBe(false);
    expect(v.falhas).toEqual([]);
  });

  it("B — Telefonia em pausa não recebe distribuição automática", () => {
    const c = cand("u1", { em_pausa: true, elegivel: false, motivo_exclusao: "em_pausa" });
    expect(resumoExclusoes([c], { u1: "Maria" })).toEqual(["Maria → excluído: Pausa"]);
    expect(verificarAtribuicao(auditoria("u1", [c])).falhas).toContain(
      "atendente atribuído não estava Online",
    );
  });

  it("C — Telefonia offline não recebe distribuição automática", () => {
    const c = cand("u1", {
      presence_status: "OFFLINE",
      elegivel: false,
      motivo_exclusao: "status_offline",
    });
    expect(resumoExclusoes([c], { u1: "Maria" })).toEqual(["Maria → excluído: Offline"]);
    expect(verificarAtribuicao(auditoria("u1", [c])).assigned_user_online).toBe(false);
  });

  it("D — Recepção Online não entra no pool só por estar online", () => {
    const c = cand("u1", {
      perfil_telefonia: false,
      elegivel: false,
      motivo_exclusao: "sem_perfil_telefonia",
    });
    expect(resumoExclusoes([c], { u1: "Carlos" })).toEqual(["Carlos → excluído: sem Telefonia"]);
    expect(verificarAtribuicao(auditoria("u1", [c])).falhas).toContain(
      "atendente atribuído sem o perfil Telefonia",
    );
  });

  it("E — administrador Online não recebe distribuição automática", () => {
    const c = cand("u1", { admin: true, elegivel: false, motivo_exclusao: "admin_excluido" });
    expect(resumoExclusoes([c], { u1: "Jean" })).toEqual(["Jean → excluído: Admin"]);
    expect(verificarAtribuicao(auditoria("u1", [c])).falhas).toContain(
      "atendente atribuído é administrador",
    );
  });

  it("F — Recepção → Telefonia + Online passa a ser elegível", () => {
    const antes = cand("u1", {
      perfil_telefonia: false,
      elegivel: false,
      motivo_exclusao: "sem_perfil_telefonia",
    });
    const depois = cand("u1");
    expect(antes.elegivel).toBe(false);
    expect(verificarAtribuicao(auditoria("u1", [depois])).falhas).toEqual([]);
  });

  it("G — Telefonia → Recepção deixa de ser elegível para novos handoffs", () => {
    const depois = cand("u1", {
      perfil_telefonia: false,
      elegivel: false,
      motivo_exclusao: "sem_perfil_telefonia",
    });
    expect(depois.elegivel).toBe(false);
    expect(verificarAtribuicao(auditoria("u1", [depois])).assigned_user_has_telefonia).toBe(false);
  });

  it("H — sem nenhum Telefonia Online, ninguém é escolhido e a conversa aguarda", () => {
    const candidatos = [
      cand("u1", { perfil_telefonia: false, elegivel: false, motivo_exclusao: "sem_perfil_telefonia" }),
      cand("u2", { em_pausa: true, elegivel: false, motivo_exclusao: "em_pausa" }),
      cand("u3", { presence_status: "OFFLINE", elegivel: false, motivo_exclusao: "status_offline" }),
      cand("u4", { admin: true, elegivel: false, motivo_exclusao: "admin_excluido" }),
    ];
    expect(candidatos.some((c) => c.elegivel)).toBe(false);
    const v = verificarAtribuicao(auditoria(null, candidatos));
    expect(v.falhas).toContain("nenhum atendente foi atribuído");
    expect(v.duplicate_assignment).toBe(false);
  });
});
