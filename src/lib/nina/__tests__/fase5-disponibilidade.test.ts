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

  test("Em pausa não recebe novas conversas", () => {
    const r = verificarElegibilidade({ ...base, emPausa: true });
    expect(r.eligible_for_nina_handoff).toBe(false);
    expect(r.motivo).toBe("em pausa");
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

  test("Online não dispensa permissão, vínculo de setor e capacidade", () => {
    expect(verificarElegibilidade({ ...base, temTelefonia: false }).motivo).toBe(
      "sem o perfil Telefonia",
    );
    expect(verificarElegibilidade({ ...base, admin: true }).motivo).toBe(
      "administrador não recebe atribuição automática",
    );
    expect(
      verificarElegibilidade({ ...base, cargaAtiva: 5, capacidadeMaxima: 5 }).motivo,
    ).toBe("capacidade lotada");
    const pool = poolElegivel(
      [
        { ...base, userId: "do-setor", departamentos: ["setor-1"] },
        { ...base, userId: "fora-do-setor", departamentos: ["setor-2"] },
      ],
      { departamentoId: "setor-1" },
    );
    expect(pool.map((c) => c.userId)).toEqual(["do-setor"]);
  });

  test("pool só considera quem escolheu Online", () => {
    const pool = poolElegivel([
      { ...base, userId: "online" },
      { ...base, userId: "offline", status: "OFFLINE" },
      { ...base, userId: "pausa", emPausa: true },
      { ...base, userId: "sem-escolha", status: null },
    ]);
    expect(pool.map((c) => c.userId)).toEqual(["online"]);
  });
});
