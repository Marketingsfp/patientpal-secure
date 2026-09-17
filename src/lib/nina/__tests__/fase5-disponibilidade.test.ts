import { describe, expect, test } from "bun:test";
import { poolElegivel, verificarElegibilidade } from "../telefonia-elegibilidade";

const base = {
  userId: "u1",
  temTelefonia: true,
  status: "ONLINE" as const,
};

describe("FASE 5 — disponibilidade para receber conversas", () => {
  test("Online recebe quando os demais requisitos estão atendidos", () => {
    expect(verificarElegibilidade({ ...base }).eligible_for_nina_handoff).toBe(true);
  });

  test("Offline não recebe novas conversas", () => {
    const r = verificarElegibilidade({ ...base, status: "OFFLINE" });
    expect(r.eligible_for_nina_handoff).toBe(false);
    expect(r.motivo).toBe("status OFFLINE");
  });

  test("Pausa recebe reservas quando ainda não tem 10", () => {
    const r = verificarElegibilidade({ ...base, status: "PAUSA", emPausa: true });
    expect(r.eligible_for_nina_handoff).toBe(true);
    expect(r.user_online).toBe(false);
  });

  test("sem escolha manual registrada, não recebe", () => {
    const r = verificarElegibilidade({ ...base, status: null });
    expect(r.eligible_for_nina_handoff).toBe(false);
    expect(r.motivo).toBe("sem escolha de presença");
  });

  test("Online continua recebendo mesmo com heartbeat antigo (aba oculta/inatividade)", () => {
    const r = verificarElegibilidade({ ...base, presencaRecente: false, aceitaNovas: false });
    expect(r.eligible_for_nina_handoff).toBe(true);
    expect(r.user_online).toBe(true);
  });

  test("Online não dispensa permissão e vínculo de setor; limite legado não restringe", () => {
    expect(verificarElegibilidade({ ...base, temTelefonia: false }).motivo).toBe(
      "sem o perfil Telefonia",
    );
    expect(verificarElegibilidade({ ...base, admin: true }).motivo).toBe(
      "administrador não recebe atribuição automática",
    );
    expect(
      verificarElegibilidade({ ...base, cargaAtiva: 5, capacidadeMaxima: 5 }).motivo,
    ).toBeNull();
    const pool = poolElegivel(
      [
        { ...base, userId: "do-setor", departamentos: ["setor-1"] },
        { ...base, userId: "fora-do-setor", departamentos: ["setor-2"] },
      ],
      { departamentoId: "setor-1" },
    );
    expect(pool.map((c) => c.userId)).toEqual(["do-setor"]);
  });

  test("pool considera Online e Pausa com espaço", () => {
    const pool = poolElegivel([
      { ...base, userId: "online" },
      { ...base, userId: "offline", status: "OFFLINE" },
      { ...base, userId: "pausa", status: "PAUSA", emPausa: true },
      { ...base, userId: "sem-escolha", status: null },
    ]);
    expect(pool.map((c) => c.userId)).toEqual(["online", "pausa"]);
  });
});
