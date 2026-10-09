import { describe, expect, it } from "bun:test";
import { resumirDia } from "./resumo-do-dia";
import {
  idsCheckupRosa,
  linhasDaCategoria,
  situacaoFinanceira,
  type CategoriaResumo,
  type LinhaDetalhe,
} from "./detalhe-resumo";

function linha(
  id: string,
  hora: string,
  nome: string | null,
  status: string | null = "agendado",
  extra: Partial<LinhaDetalhe> = {},
): LinhaDetalhe {
  return {
    id,
    inicio: `2026-10-02T${hora}:00-03:00`,
    paciente_nome: nome,
    paciente_id: nome ? `pac-${nome}` : null,
    medico_id: "med-1",
    agenda_id: "ag-1",
    status,
    ...extra,
  };
}

const DIA: LinhaDetalhe[] = [
  linha("l1", "08:00", "DISPONÍVEL"),
  linha("l2", "08:10", "BLOQUEIO"),
  linha("a1", "08:20", "ANA"),
  linha("a2", "08:20", "BIA"), // encaixe por cima da ANA
  linha("c1", "08:30", "CAIO", "confirmado"),
  linha("e1", "08:40", "EVA", "confirmado", { fluxo_etapa: "atendimento" }),
  linha("t1", "08:45", "TETE", "agendado", { fluxo_etapa: "triagem" }),
  linha("r1", "08:50", "RUI", "realizado"),
  linha("x1", "09:00", "XICO", "cancelado"),
  linha("f1", "09:10", "FABI", "faltou"),
  linha("z1", "09:20", "ZECA", "status_novo"),
];

describe("linhasDaCategoria", () => {
  it("cada lista tem o tamanho do número do contador", () => {
    for (const ate of ["2026-10-01", "2026-10-02"]) {
      const r = resumirDia(DIA, ate);
      const casos: Array<[CategoriaResumo, number]> = [
        ["fichasGeradas", r.fichasGeradas],
        ["livres", r.livres],
        ["agendados", r.agendados],
        ["aguardando", r.aguardando],
        ["confirmados", r.confirmados],
        ["emAtendimento", r.emAtendimento],
        ["atendidos", r.atendidos],
        ["cancelados", r.cancelados],
        ["faltas", r.faltas],
      ];
      for (const [cat, n] of casos) expect(linhasDaCategoria(DIA, cat, ate).length).toBe(n);
    }
  });

  it("encaixes listam as duas fichas do horário dividido", () => {
    expect(
      linhasDaCategoria(DIA, "encaixes")
        .map((a) => a.id)
        .sort(),
    ).toEqual(["a1", "a2"]);
  });
});

describe("situacaoFinanceira", () => {
  const pagos = new Set(["p1"]);
  it("segue o critério da Agenda", () => {
    expect(situacaoFinanceira(linha("p1", "08:00", "ANA"), pagos)).toBe("pago");
    expect(
      situacaoFinanceira(
        linha("p2", "08:00", "ANA", "agendado", { data_pagamento: "2026-10-01" }),
        pagos,
      ),
    ).toBe("pago");
    expect(situacaoFinanceira(linha("p3", "08:00", "ANA"), pagos)).toBe("pendente");
    expect(
      situacaoFinanceira(
        linha("p4", "08:00", "ANA", "agendado", { tipo_atendimento: "convenio" }),
        pagos,
      ),
    ).toBe("convenio");
    expect(
      situacaoFinanceira(linha("p5", "08:00", "ANA", "agendado", { sem_faturamento: true }), pagos),
    ).toBe("sem_faturamento");
    expect(situacaoFinanceira(linha("p6", "08:00", "ANA", "cancelado"), pagos)).toBe(
      "nao_se_aplica",
    );
    expect(situacaoFinanceira(linha("p7", "08:00", "DISPONÍVEL"), pagos)).toBe("nao_se_aplica");
  });
});

describe("idsCheckupRosa", () => {
  const esp = (m: string | null | undefined) =>
    m === "gineco" ? "GINECOLOGIA" : "ULTRASSONOGRAFIA";
  it("marca o paciente cujas fichas formam um pacote, ignorando outras especialidades", () => {
    const linhas = [
      linha("g1", "08:00", "ANA", "agendado", { medico_id: "gineco", procedimento: "CONSULTA" }),
      linha("g2", "08:10", "ANA", "agendado", { medico_id: "gineco", procedimento: "PREVENTIVO" }),
      linha("u1", "08:30", "ANA", "agendado", {
        medico_id: "usg",
        procedimento: "USG TRANSVAGINAL",
      }),
      linha("o1", "09:00", "ANA", "agendado", { medico_id: "cardio", procedimento: "ECG" }),
      // BIA só tem consulta e preventivo: não forma pacote.
      linha("b1", "08:20", "BIA", "agendado", { medico_id: "gineco", procedimento: "CONSULTA" }),
      linha("b2", "08:40", "BIA", "agendado", { medico_id: "gineco", procedimento: "PREVENTIVO" }),
    ];
    expect([...idsCheckupRosa(linhas, esp)].sort()).toEqual(["g1", "g2", "u1"]);
  });

  it("ficha cancelada não conta para o pacote", () => {
    const linhas = [
      linha("g1", "08:00", "ANA", "agendado", { medico_id: "gineco", procedimento: "CONSULTA" }),
      linha("g2", "08:10", "ANA", "cancelado", { medico_id: "gineco", procedimento: "PREVENTIVO" }),
      linha("u1", "08:30", "ANA", "agendado", {
        medico_id: "usg",
        procedimento: "USG TRANSVAGINAL",
      }),
    ];
    expect(idsCheckupRosa(linhas, esp).size).toBe(0);
  });
});
