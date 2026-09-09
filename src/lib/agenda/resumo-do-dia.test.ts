import { describe, expect, it } from "bun:test";
import { contarEncaixes, ehLivre, resumirDia, type LinhaResumo } from "./resumo-do-dia";

const MED = "med-1";
const AG = "ag-1";

function linha(
  id: string,
  hora: string,
  nome: string | null,
  status: string | null = "agendado",
  extra: Partial<LinhaResumo> = {},
): LinhaResumo {
  return {
    id,
    inicio: `2026-09-09T${hora}:00-03:00`,
    paciente_nome: nome,
    paciente_id: nome ? `pac-${nome}` : null,
    medico_id: MED,
    agenda_id: AG,
    status,
    ...extra,
  };
}

describe("ehLivre", () => {
  it("reconhece as vagas da grade", () => {
    expect(ehLivre("DISPONÍVEL")).toBe(true);
    expect(ehLivre("disponivel")).toBe(true);
    expect(ehLivre("BLOQUEIO")).toBe(true);
    expect(ehLivre("")).toBe(true);
    expect(ehLivre(null)).toBe(true);
    expect(ehLivre("MARIA DA SILVA")).toBe(false);
  });
});

describe("resumirDia", () => {
  it("separa livres de agendadas e soma os status", () => {
    const r = resumirDia([
      linha("a", "08:00", "DISPONÍVEL"),
      linha("b", "08:10", "MARIA", "agendado"),
      linha("c", "08:20", "JOAO", "confirmado"),
      linha("d", "08:30", "ANA", "em_atendimento"),
      linha("e", "08:40", "PEDRO", "realizado"),
      linha("f", "08:50", "LUCAS", "cancelado"),
      linha("g", "09:00", "CARLA", "faltou"),
    ]);
    expect(r.fichasGeradas).toBe(7);
    expect(r.livres).toBe(1);
    expect(r.agendados).toBe(6);
    expect(r.aguardando).toBe(1);
    expect(r.confirmados).toBe(1);
    expect(r.emAtendimento).toBe(1);
    expect(r.atendidos).toBe(1);
    expect(r.cancelados).toBe(1);
    expect(r.faltas).toBe(1);
  });

  it("os status de ficha ocupada sempre somam o total de agendadas", () => {
    const r = resumirDia([
      linha("a", "08:00", "DISPONÍVEL"),
      linha("b", "08:10", "MARIA", "confirmado"),
      linha("c", "08:20", "JOAO", "status_novo_do_banco"),
    ]);
    expect(
      r.aguardando + r.confirmados + r.emAtendimento + r.atendidos + r.cancelados + r.faltas,
    ).toBe(r.agendados);
  });

  it("status desconhecido não some da conta — cai em aguardando", () => {
    const r = resumirDia([linha("c", "08:20", "JOAO", "status_novo_do_banco")]);
    expect(r.aguardando).toBe(1);
  });
});

describe("contarEncaixes", () => {
  it("conta o paciente extra no mesmo horário", () => {
    const r = resumirDia([
      linha("a", "08:00", "MARIA"),
      linha("enc", "08:00", "JOAO"),
      linha("b", "08:10", "ANA"),
    ]);
    expect(r.encaixes).toBe(1);
    expect(r.agendados).toBe(3);
  });

  it("dois encaixes no mesmo horário contam dois", () => {
    expect(
      contarEncaixes([
        linha("a", "08:00", "MARIA"),
        linha("e1", "08:00", "JOAO"),
        linha("e2", "08:00", "ANA"),
      ]),
    ).toBe(2);
  });

  it("vaga livre no mesmo horário não vira encaixe", () => {
    expect(
      contarEncaixes([linha("a", "08:00", "DISPONÍVEL"), linha("b", "08:00", "DISPONÍVEL")]),
    ).toBe(0);
  });

  it("atendimento múltiplo do MESMO paciente não é encaixe", () => {
    // Caso real da produção (08/09/2026, 13:00): duas odontologias do mesmo
    // paciente, uma linha por procedimento.
    expect(
      contarEncaixes([
        linha("p1", "13:00", "ROGERIO", "agendado", { atendimento_grupo_id: "g1" } as never),
        linha("p2", "13:00", "ROGERIO", "agendado", { atendimento_grupo_id: "g1" } as never),
      ]),
    ).toBe(0);
  });

  it("linha sem profissional fica fora da conta", () => {
    // Caso real da produção (08/09/2026, 10:00): dois atendimentos externos
    // sem médico vinculado, sem relação um com o outro.
    expect(
      contarEncaixes([
        linha("a", "10:00", "RODRIGO", "agendado", { medico_id: null, agenda_id: null }),
        linha("b", "10:00", "AYLTON", "agendado", { medico_id: null, agenda_id: null }),
      ]),
    ).toBe(0);
  });

  it("agendas diferentes no mesmo horário são filas distintas", () => {
    expect(
      contarEncaixes([
        linha("a", "08:00", "MARIA", "agendado", { agenda_id: "ag-1" }),
        linha("b", "08:00", "JOAO", "agendado", { agenda_id: "ag-2" }),
      ]),
    ).toBe(0);
  });

  it("profissionais diferentes no mesmo horário não são encaixe", () => {
    expect(
      contarEncaixes([
        linha("a", "08:00", "MARIA", "agendado", { medico_id: "med-1" }),
        linha("b", "08:00", "JOAO", "agendado", { medico_id: "med-2" }),
      ]),
    ).toBe(0);
  });

  it("fila por ordem de chegada não gera encaixe detectável", () => {
    // Horários distintos: a conta devolve zero de propósito (limite conhecido).
    expect(
      contarEncaixes([
        linha("a", "08:00", "MARIA"),
        linha("b", "08:05", "JOAO"),
        linha("c", "08:10", "ANA"),
      ]),
    ).toBe(0);
  });
});
