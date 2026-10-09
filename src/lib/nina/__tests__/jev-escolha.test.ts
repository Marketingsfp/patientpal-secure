import { describe, expect, test } from "bun:test";
import {
  decisaoEscolha,
  perguntasEscolha,
  estadoEscolha,
  type SituacaoEscolha,
} from "../jev-escolha";
import { validarRespostas } from "../jev";
import type { VagaAgendamento } from "../agendamento-escolha";

const vaga = (hora: string): VagaAgendamento =>
  ({
    medico_id: "m1",
    medico: "Dra. Ana",
    procedimento: "Consulta",
    data: "2026-10-05",
    hora,
    inicio: `2026-10-05T${hora}:00-03:00`,
    fim: `2026-10-05T${hora}:30-03:00`,
    modalidade: "agendamento",
  }) as unknown as VagaAgendamento;
const opcoes: SituacaoEscolha = {
  tipo: "opcoes",
  opcoes: [vaga("08:00"), vaga("10:00"), vaga("14:00")],
};
const resumo: SituacaoEscolha = {
  tipo: "resumo",
  vaga: vaga("10:00"),
  resumo: "Consulta 05/10 às 10:00. Confirma?",
};

describe("Jev Fase 7 — escolha e aceite", () => {
  test("só oferece ao Jev as opções reais + nenhuma", () => {
    const p = perguntasEscolha(opcoes).horario as { criteria: Record<string, string> };
    expect(Object.keys(p.criteria)).toEqual(["opcao_1", "opcao_2", "opcao_3", "nenhuma"]);
    const estado = estadoEscolha("a segunda", null, opcoes);
    expect("opcoes_oferecidas" in estado ? estado.opcoes_oferecidas : []).toHaveLength(3);
  });
  test("escolha com 80% vira a vaga oferecida", () => {
    const d = decisaoEscolha(
      { horario: { choice: "opcao_2", probabilities: { opcao_2: 0.9 } } },
      opcoes,
    );
    expect(d).toEqual({ tipo: "escolheu", vaga: vaga("10:00") });
  });
  test("abaixo de 80% ou 'nenhuma' não aplica nada", () => {
    expect(
      decisaoEscolha({ horario: { choice: "opcao_2", probabilities: { opcao_2: 0.6 } } }, opcoes)
        .tipo,
    ).toBe("nada");
    expect(
      decisaoEscolha({ horario: { choice: "nenhuma", probabilities: { nenhuma: 0.99 } } }, opcoes)
        .tipo,
    ).toBe("nada");
  });
  test("opção fora da lista é rejeitada na validação (nunca inventa horário)", () => {
    const p = perguntasEscolha(opcoes);
    expect(validarRespostas(p, { answers: { horario: { choice: "opcao_9" } } })).toBeNull();
  });
  test("aceite só com 'aceitou' e certeza mínima", () => {
    expect(
      decisaoEscolha({ aceite: { choice: "aceitou", probabilities: { aceitou: 0.85 } } }, resumo)
        .tipo,
    ).toBe("aceitou");
    expect(
      decisaoEscolha({ aceite: { choice: "aceitou", probabilities: { aceitou: 0.7 } } }, resumo)
        .tipo,
    ).toBe("nada");
    expect(
      decisaoEscolha(
        { aceite: { choice: "pediu_outra_coisa", probabilities: { pediu_outra_coisa: 0.95 } } },
        resumo,
      ).tipo,
    ).toBe("nada");
    expect(
      decisaoEscolha({ aceite: { choice: "recusou", probabilities: { recusou: 0.95 } } }, resumo)
        .tipo,
    ).toBe("nada");
  });
});
