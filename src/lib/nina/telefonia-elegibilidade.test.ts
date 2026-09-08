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

/* =========================================================
 *  FASE 3 — gate da distribuição automática
 * ======================================================= */
describe("FASE 3 — elegibilidade e atribuição automática", () => {
  const base = (userId: string, over: Partial<CandidatoDistribuicao> = {}): CandidatoDistribuicao => ({
    userId,
    temTelefonia: true,
    status: "ONLINE",
    aceitaNovas: true,
    presencaRecente: true,
    cargaAtiva: 0,
    ...over,
  });

  it("1 Telefonia Online recebe a conversa", () => {
    const r = simularAtribuicao([base("ana")]);
    expect(r.assignment_occurred).toBe(true);
    expect(r.atribuido_a).toBe("ana");
  });

  it("3 Telefonia Online: distribui equilibrado, sem repetir sempre o primeiro", () => {
    const { atribuicoes, naoAtribuidas } = simularFila(
      [base("ana"), base("bia"), base("caio")],
      6,
    );
    expect(naoAtribuidas).toBe(0);
    const contagem = new Map<string, number>();
    for (const u of atribuicoes) contagem.set(u!, (contagem.get(u!) ?? 0) + 1);
    expect([...contagem.values()].sort()).toEqual([2, 2, 2]);
  });

  it("empate de carga: recebe quem está há mais tempo sem conversa", () => {
    const r = simularAtribuicao([
      base("ana", { cargaAtiva: 2, ultimaAtribuicaoEm: "2026-09-08T12:00:00Z" }),
      base("bia", { cargaAtiva: 2, ultimaAtribuicaoEm: "2026-09-08T09:00:00Z" }),
    ]);
    expect(r.atribuido_a).toBe("bia");
  });

  it("entrou em Pausa durante a seleção: escolhe outra atendente", () => {
    const r = simularAtribuicao([base("ana"), base("bia", { cargaAtiva: 1 })], {
      revalidar: (id) => (id === "ana" ? base("ana", { emPausa: true }) : null),
    });
    expect(r.atribuido_a).toBe("bia");
  });

  it("duas conversas simultâneas não vão para a mesma pessoa por padrão", () => {
    const { atribuicoes } = simularFila([base("ana"), base("bia")], 2);
    expect(new Set(atribuicoes).size).toBe(2);
  });

  it("usuário sem Telefonia nunca recebe", () => {
    const r = simularAtribuicao([base("sem", { temTelefonia: false })]);
    expect(r.destino).toBe("nao_atribuidas");
  });

  it("Admin com Telefonia continua fora da distribuição", () => {
    const r = simularAtribuicao([base("chefe", { admin: true })]);
    expect(r.atribuido_a).toBeNull();
  });

  it("ninguém elegível: conversa fica em Não atribuídas", () => {
    const r = simularAtribuicao([
      base("ana", { status: "OFFLINE" }),
      base("bia", { emPausa: true }),
      base("caio", { temTelefonia: false }),
    ]);
    expect(r.destino).toBe("nao_atribuidas");
    expect(r.atribuido_a).toBeNull();
  });

  it("capacidade lotada tira do balanceamento em vez de sobrecarregar", () => {
    const r = simularAtribuicao([
      base("ana", { cargaAtiva: 5, capacidadeMaxima: 5 }),
      base("bia", { cargaAtiva: 4, capacidadeMaxima: 5 }),
    ]);
    expect(r.atribuido_a).toBe("bia");
    expect(
      simularAtribuicao([base("ana", { cargaAtiva: 5, capacidadeMaxima: 5 })]).destino,
    ).toBe("nao_atribuidas");
  });

  it("todos descartados na revalidação: fila, nunca alguém offline", () => {
    const r = simularAtribuicao([base("ana"), base("bia")], {
      revalidar: (id) => base(id, { status: "OFFLINE" }),
    });
    expect(r.atribuido_a).toBeNull();
  });
});
