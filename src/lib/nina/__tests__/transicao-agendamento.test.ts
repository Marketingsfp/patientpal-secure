import { describe, expect, test } from "bun:test";
import {
  REGRA_TRANSICAO_AGENDAMENTO,
  TRANSICAO_AGENDAMENTO_ATIVA,
  acaoNaTransicao,
  deveEncaminharAgendamentoAntesDoModelo,
  temIntencaoDeAgendar,
} from "../transicao-agendamento";

describe("transição temporária do agendamento da Nina", () => {
  test("fica ativa até a retomada controlada do agendamento", () => {
    expect(TRANSICAO_AGENDAMENTO_ATIVA).toBe(true);
  });

  test("Jev e leitura determinística distinguem informação de intenção de agendar", () => {
    expect(temIntencaoDeAgendar(["horario", "valor"])).toBe(false);
    expect(temIntencaoDeAgendar(["agendamento"])).toBe(true);
    expect(temIntencaoDeAgendar(["disponibilidade"])).toBe(true);
  });

  test("usa a modalidade realmente salva, sem mascarar o catálogo em memória", () => {
    expect(acaoNaTransicao(["valor"], "nao_definida")).toBe("responder_informacoes");
    expect(acaoNaTransicao(["agendamento"], "nao_definida")).toBe("encaminhar_agendamento");
    expect(acaoNaTransicao(["disponibilidade"], "hora_marcada")).toBe("encaminhar_agendamento");
    expect(acaoNaTransicao(["agendamento"], "chegada_sem_pre_agendamento")).toBe(
      "orientar_comparecimento",
    );
  });

  test("encaminha por código antes do modelo quando o paciente quer agendar", () => {
    const base = {
      ferramentasAgendaAtivas: false,
      intencoes: ["agendamento"] as const,
      modalidade: "nao_definida" as const,
      atendimentoIdentificado: true,
      jaPossuiEncaminhamento: false,
    };

    expect(deveEncaminharAgendamentoAntesDoModelo(base)).toBe(true);
    expect(
      deveEncaminharAgendamentoAntesDoModelo({
        ...base,
        intencoes: ["disponibilidade"],
        modalidade: "hora_marcada",
      }),
    ).toBe(true);
  });

  test("não antecipa o encaminhamento quando falta o atendimento ou já existe outra decisão", () => {
    const base = {
      ferramentasAgendaAtivas: false,
      intencoes: ["agendamento"] as const,
      modalidade: "nao_definida" as const,
      atendimentoIdentificado: true,
      jaPossuiEncaminhamento: false,
    };

    expect(
      deveEncaminharAgendamentoAntesDoModelo({ ...base, atendimentoIdentificado: false }),
    ).toBe(false);
    expect(deveEncaminharAgendamentoAntesDoModelo({ ...base, jaPossuiEncaminhamento: true })).toBe(
      false,
    );
    expect(deveEncaminharAgendamentoAntesDoModelo({ ...base, ferramentasAgendaAtivas: true })).toBe(
      false,
    );
  });

  test("mantém informação simples e ordem de chegada fora do encaminhamento automático", () => {
    expect(
      deveEncaminharAgendamentoAntesDoModelo({
        ferramentasAgendaAtivas: false,
        intencoes: ["horario", "valor"],
        modalidade: "nao_definida",
        atendimentoIdentificado: true,
        jaPossuiEncaminhamento: false,
      }),
    ).toBe(false);
    expect(
      deveEncaminharAgendamentoAntesDoModelo({
        ferramentasAgendaAtivas: false,
        intencoes: ["agendamento"],
        modalidade: "chegada_sem_pre_agendamento",
        atendimentoIdentificado: true,
        jaPossuiEncaminhamento: false,
      }),
    ).toBe(false);
  });

  test("regra enviada à Nina diferencia escala, vaga, transferência e comparecimento", () => {
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain("Horario habitual nao e vaga disponivel");
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain("solicitar_atendente_humano");
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain("setor Agendamento");
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain("basta comparecer a clinica");
  });
});
