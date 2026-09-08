import { describe, expect, it } from "bun:test";
import {
  criteriosDeAtribuicao,
  resumoExclusoes,
  verificarAtribuicao,
  type AuditoriaAtribuicao,
  type CandidatoAvaliado,
} from "./atribuicao-assertions";

const cand = (
  user_id: string,
  extra: Partial<CandidatoAvaliado> = {},
): CandidatoAvaliado => ({
  user_id,
  permission_telefonia: true,
  presence_status: "ONLINE",
  aceita_novas: true,
  presenca_recente: true,
  em_pausa: false,
  admin: false,
  load_at_selection: 0,
  elegivel: true,
  motivo_exclusao: null,
  ...extra,
});

const auditoria = (extra: Partial<AuditoriaAtribuicao> = {}): AuditoriaAtribuicao => ({
  conversation_id: "conv-1",
  handoff_event_id: "ev-1",
  selected_user_id: "maria",
  permission_telefonia: true,
  presence_status: "ONLINE",
  load_at_selection: 1,
  unit_queue: null,
  assignment_method: "distribuicao_automatica",
  assigned_at: "2026-09-08T16:00:00Z",
  candidates_evaluated: [cand("maria")],
  ...extra,
});

describe("FASE 5 — assertions objetivas da atribuição", () => {
  it("cenário completo: só Maria elegível, Jean em pausa, Carlos sem Telefonia, Admin excluído", () => {
    const candidatos = [
      cand("maria"),
      cand("jean", { em_pausa: true, elegivel: false, motivo_exclusao: "em_pausa" }),
      cand("carlos", {
        permission_telefonia: false,
        elegivel: false,
        motivo_exclusao: "missing_telefonia_permission",
      }),
      cand("adminx", { admin: true, elegivel: false, motivo_exclusao: "admin_excluido" }),
    ];
    const v = verificarAtribuicao(auditoria({ candidates_evaluated: candidatos }));
    expect(v.assigned_user_has_telefonia).toBe(true);
    expect(v.assigned_user_online).toBe(true);
    expect(v.assigned_user_admin).toBe(false);
    expect(v.duplicate_assignment).toBe(false);
    expect(v.falhas).toEqual([]);
    expect(criteriosDeAtribuicao(v).every((c) => c.ok)).toBe(true);

    expect(resumoExclusoes(candidatos, { adminx: "Admin X" })).toEqual([
      "maria → elegível",
      "jean → excluído: Pausa",
      "carlos → excluído: sem Telefonia",
      "Admin X → excluído: Admin",
    ]);
  });

  it("reprova atribuição para quem não tem Telefonia", () => {
    const v = verificarAtribuicao(
      auditoria({ candidates_evaluated: [cand("maria", { permission_telefonia: false })] }),
    );
    expect(v.assigned_user_has_telefonia).toBe(false);
    expect(v.falhas).toContain("atendente atribuído sem o perfil Telefonia");
  });

  it("reprova atribuição para quem está em pausa ou offline", () => {
    expect(
      verificarAtribuicao(auditoria({ candidates_evaluated: [cand("maria", { em_pausa: true })] }))
        .assigned_user_online,
    ).toBe(false);
    expect(
      verificarAtribuicao(
        auditoria({ candidates_evaluated: [cand("maria", { presence_status: "OFFLINE" })] }),
      ).assigned_user_online,
    ).toBe(false);
  });

  it("reprova administrador", () => {
    const v = verificarAtribuicao(
      auditoria({ candidates_evaluated: [cand("maria", { admin: true })] }),
    );
    expect(v.assigned_user_admin).toBe(true);
    expect(v.falhas).toContain("atendente atribuído é administrador");
  });

  it("detecta atribuição duplicada na mesma conversa", () => {
    const a = auditoria();
    const b = auditoria({ selected_user_id: "jean" });
    const v = verificarAtribuicao(a, [a, b]);
    expect(v.duplicate_assignment).toBe(true);
  });

  it("acusa auditoria incompleta", () => {
    const v = verificarAtribuicao(auditoria({ assigned_at: null, assignment_method: null }));
    expect(v.audit_complete).toBe(false);
    expect(v.falhas).toContain("auditoria da atribuição incompleta");
  });
});
