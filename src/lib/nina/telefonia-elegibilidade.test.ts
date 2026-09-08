import { describe, expect, it } from "bun:test";
import {
  conversaAtribuidaPermanece,
  poolElegivel,
  simularAtribuicao,
  simularFila,
  verificarElegibilidade,
  type CandidatoDistribuicao,
} from "./telefonia-elegibilidade";

const base: CandidatoDistribuicao = {
  userId: "u",
  temTelefonia: true,
  status: "ONLINE",
};

describe("FASE 5 — elegibilidade Telefonia para handoff da Nina", () => {
  it("cenário 1 — Telefonia + Online recebe", () => {
    const jean = { ...base, userId: "jean", nome: "Jean" };
    const v = verificarElegibilidade(jean);
    expect(v.user_has_telefonia).toBe(true);
    expect(v.user_online).toBe(true);
    expect(v.eligible_for_nina_handoff).toBe(true);
    expect(simularAtribuicao([jean])).toEqual({
      assignment_occurred: true,
      atribuido_a: "jean",
      destino: "atribuida",
    });
  });

  it("cenário 2 — Recepção Online, sem Telefonia, não recebe", () => {
    const maria = { ...base, userId: "maria", temTelefonia: false };
    const v = verificarElegibilidade(maria);
    expect(v.user_online).toBe(true);
    expect(v.eligible_for_nina_handoff).toBe(false);
    expect(v.motivo).toBe("sem permissão Telefonia");
    expect(simularAtribuicao([maria]).destino).toBe("nao_atribuidas");
  });

  it("cenário 3 — Telefonia em pausa não recebe", () => {
    const joao = { ...base, userId: "joao", emPausa: true };
    expect(verificarElegibilidade(joao).eligible_for_nina_handoff).toBe(false);
    expect(verificarElegibilidade(joao).motivo).toBe("em pausa");
  });

  it("Telefonia Offline não recebe", () => {
    const off = { ...base, userId: "off", status: "OFFLINE" as const };
    const v = verificarElegibilidade(off);
    expect(v.user_online).toBe(false);
    expect(v.eligible_for_nina_handoff).toBe(false);
  });

  it("cenário 4 — ninguém Telefonia Online vai para Não atribuídas", () => {
    const r = simularAtribuicao([
      { ...base, userId: "maria", temTelefonia: false },
      { ...base, userId: "joao", emPausa: true },
      { ...base, userId: "off", status: "OFFLINE" },
    ]);
    expect(r.assignment_occurred).toBe(false);
    expect(r.destino).toBe("nao_atribuidas");
  });

  it("cenário 5 — Telefonia volta Online e a fila é reavaliada", () => {
    const antes = simularFila([{ ...base, userId: "jean", status: "OFFLINE" }], 3);
    expect(antes.naoAtribuidas).toBe(3);

    const depois = simularFila([{ ...base, userId: "jean", status: "ONLINE" }], 3);
    expect(depois.naoAtribuidas).toBe(0);
    expect(depois.atribuicoes).toEqual(["jean", "jean", "jean"]);
  });

  it("cenário 6 — três Online, só dois com Telefonia, balanceamento entre os dois", () => {
    const candidatos: CandidatoDistribuicao[] = [
      { ...base, userId: "jean" },
      { ...base, userId: "maria" },
      { ...base, userId: "carlos", temTelefonia: false },
    ];
    expect(poolElegivel(candidatos).map((c) => c.userId)).toEqual(["jean", "maria"]);

    const { atribuicoes, naoAtribuidas } = simularFila(candidatos, 4);
    expect(naoAtribuidas).toBe(0);
    expect(atribuicoes).not.toContain("carlos");
    expect(atribuicoes.filter((a) => a === "jean")).toHaveLength(2);
    expect(atribuicoes.filter((a) => a === "maria")).toHaveLength(2);
  });

  it("cenário 7 — Admin com Telefonia permanece fora da distribuição automática", () => {
    const adm = { ...base, userId: "adm", admin: true };
    const v = verificarElegibilidade(adm);
    expect(v.user_has_telefonia).toBe(true);
    expect(v.user_online).toBe(true);
    expect(v.eligible_for_nina_handoff).toBe(false);
    expect(v.motivo).toBe("administrador não recebe atribuição automática");
    expect(simularAtribuicao([adm]).destino).toBe("nao_atribuidas");
  });

  it("cenário 8 — perder Telefonia não retira a conversa em andamento", () => {
    expect(
      conversaAtribuidaPermanece({ atribuidaA: "jean", usuarioPerdeuTelefonia: true }),
    ).toBe(true);
    // Mas deixa de receber novas.
    expect(
      verificarElegibilidade({ ...base, userId: "jean", temTelefonia: false })
        .eligible_for_nina_handoff,
    ).toBe(false);
  });

  it("homologação não afrouxa a regra: Online sem Telefonia continua inelegível", () => {
    expect(
      verificarElegibilidade({ ...base, userId: "teste", temTelefonia: false })
        .eligible_for_nina_handoff,
    ).toBe(false);
  });

  it("setor só filtra quando existe elegível daquele setor", () => {
    const candidatos: CandidatoDistribuicao[] = [
      { ...base, userId: "jean", departamentos: ["agenda"] },
      { ...base, userId: "maria", departamentos: [] },
    ];
    expect(simularAtribuicao(candidatos, { departamentoId: "agenda" }).atribuido_a).toBe("jean");
    expect(simularAtribuicao(candidatos, { departamentoId: "financeiro" }).atribuido_a).toBe(
      "jean",
    );
  });

  it("presença desatualizada e 'não aceita novas' bloqueiam", () => {
    expect(
      verificarElegibilidade({ ...base, presencaRecente: false }).eligible_for_nina_handoff,
    ).toBe(false);
    expect(
      verificarElegibilidade({ ...base, aceitaNovas: false }).eligible_for_nina_handoff,
    ).toBe(false);
  });
});
