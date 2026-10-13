import { describe, expect, test } from "bun:test";
import {
  argumentosComDados,
  extrairDadosTransferencia,
  linhasDadosPaciente,
  normalizarDadosPaciente,
  normalizarTransferenciaPendente,
  transferenciaDispensaDados,
} from "../dados-transferencia";
import {
  intencaoDeAgendarNaSessao,
  terminaComOfertaDeAgendamento,
} from "../fluxo-agendamento-item";
import {
  blocosVisiveis,
  conteudoDoResumo,
  normalizarResumo,
} from "@/lib/atendimento/handoff-resumo";

const HOJE = new Date("2026-10-12T12:00:00Z");

describe("resumo e fluxo da transferência com dados", () => {
  test("argumentos retomados levam os dados no início do resumo", () => {
    const a = argumentosComDados(
      {
        motivo: "AGENDAMENTO_TRANSICAO: Ortopedia.",
        resumo: "Deseja agendar",
        setor: "Agendamento",
      },
      { nome_completo: "Paciente Teste", data_nascimento: "01/02/1990" },
    );
    expect(a.resumo).toBe(
      "Nome completo: Paciente Teste\nData de nascimento: 01/02/1990\nDeseja agendar",
    );
    expect(a.setor).toBe("Agendamento");
    expect(a.urgencia).toBe("normal");
  });

  test("o resumo da atendente mostra nome e data vindos do registro, não da IA", () => {
    const r = normalizarResumo(
      { intencao: "agendamento", motivo_contato: "Deseja agendar", texto_resumo: "Quer marcar." },
      { dadosPaciente: { nome_completo: "Paciente Teste", data_nascimento: null } },
    );
    const conteudo = conteudoDoResumo(r);
    expect(conteudo.tipo).toBe("texto");
    if (conteudo.tipo === "texto")
      expect(conteudo.dados).toEqual([
        { rotulo: "Nome completo", valor: "Paciente Teste" },
        { rotulo: "Data de nascimento", valor: "não informada" },
      ]);
    expect(blocosVisiveis(r).map((b) => b.titulo)).toContain("Nome completo");
    // Sem dados pedidos, nada aparece.
    const semDados = conteudoDoResumo(normalizarResumo({ texto_resumo: "Quer marcar." }));
    expect(semDados.tipo === "texto" && semDados.dados).toEqual([]);
  });

  test("intenção de agendar continua na sessão ao escolher médico ou horário", () => {
    const base = { intencaoNoTurno: false, sessaoComIntencao: true };
    expect(
      intencaoDeAgendarNaSessao({ ...base, intencoesTurno: [], mensagem: "pode ser a valeria" }),
    ).toBe(true);
    expect(
      intencaoDeAgendarNaSessao({
        ...base,
        intencoesTurno: ["horario"],
        mensagem: "seria 9h é melhor pra mim",
      }),
    ).toBe(true);
    // Pergunta nova não continua o agendamento.
    expect(
      intencaoDeAgendarNaSessao({
        ...base,
        intencoesTurno: ["horario"],
        mensagem: "qual o horário de sábado?",
      }),
    ).toBe(false);
    expect(
      intencaoDeAgendarNaSessao({ ...base, intencoesTurno: ["valor"], mensagem: "e o valor" }),
    ).toBe(false);
    expect(
      intencaoDeAgendarNaSessao({
        intencaoNoTurno: false,
        sessaoComIntencao: false,
        intencoesTurno: [],
        mensagem: "pode ser a valeria",
      }),
    ).toBe(false);
  });

  test("oferta escrita pela IA é reconhecida para virar a pergunta padrão", () => {
    expect(
      terminaComOfertaDeAgendamento(
        "Valores: R$ 120,00.\n\nPosso encaminhar nossa conversa para a nossa equipe humana de atendimento?",
      ),
    ).toBe(true);
    expect(
      terminaComOfertaDeAgendamento(
        "Atendimento: Ortopedia, sábado das 08:30 às 12:00.\nComo o agendamento é feito pela equipe, posso transferir você para o setor de agendamento?",
      ),
    ).toBe(true);
    expect(terminaComOfertaDeAgendamento("Atendemos aos sábados, das 08h às 12h.")).toBe(false);
  });
});

describe("dados do paciente antes da transferência", () => {
  test("lê nome completo e data em formatos comuns", () => {
    expect(extrairDadosTransferencia("Paciente Teste da Silva, 01/02/1990", HOJE)).toEqual({
      nome_completo: "Paciente Teste da Silva",
      data_nascimento: "01/02/1990",
    });
    expect(extrairDadosTransferencia("meu nome é paciente teste e nasci em 5-3-85", HOJE)).toEqual({
      nome_completo: "Paciente Teste",
      data_nascimento: "05/03/1985",
    });
    expect(
      extrairDadosTransferencia("Nome: Maria Teste Souza\nData de nascimento: 10.11.2001", HOJE),
    ).toEqual({ nome_completo: "Maria Teste Souza", data_nascimento: "10/11/2001" });
    expect(extrairDadosTransferencia("Joana Teste 12 de março de 1979", HOJE)).toEqual({
      nome_completo: "Joana Teste",
      data_nascimento: "12/03/1979",
    });
    expect(extrairDadosTransferencia("Paciente Teste 01021990", HOJE).data_nascimento).toBe(
      "01/02/1990",
    );
  });

  test("o que não é nome ou data válida fica null", () => {
    expect(extrairDadosTransferencia("pode sim por favor", HOJE)).toEqual({
      nome_completo: null,
      data_nascimento: null,
    });
    // Um nome só não é nome completo.
    expect(extrairDadosTransferencia("Maria", HOJE).nome_completo).toBeNull();
    // Data impossível ou no futuro.
    expect(extrairDadosTransferencia("31/02/1990", HOJE).data_nascimento).toBeNull();
    expect(extrairDadosTransferencia("01/01/2030", HOJE).data_nascimento).toBeNull();
    // CPF fictício não é data de nascimento.
    expect(extrairDadosTransferencia("000.000.000-00", HOJE).data_nascimento).toBeNull();
    // Só a data: nome fica de fora.
    expect(extrairDadosTransferencia("nasci em 20/07/1965", HOJE)).toEqual({
      nome_completo: null,
      data_nascimento: "20/07/1965",
    });
  });

  test("exceções transferem sem pedir dados", () => {
    expect(transferenciaDispensaDados({ urgencia: "alta", motivo: "x" })).toBe(true);
    expect(transferenciaDispensaDados({ motivo: "Urgência clínica relatada" })).toBe(true);
    expect(transferenciaDispensaDados({ motivo: "Reclamação sobre atendimento" })).toBe(true);
    expect(transferenciaDispensaDados({ motivo: "Paciente solicitou falar com atendente" })).toBe(
      true,
    );
    expect(transferenciaDispensaDados({ motivo: "x", pedidoExplicitoAtendente: true })).toBe(true);
    expect(transferenciaDispensaDados({ motivo: "x", avisarPaciente: false })).toBe(true);
    expect(transferenciaDispensaDados({ motivo: "AGENDAMENTO_TRANSICAO: Ortopedia." })).toBe(false);
    expect(transferenciaDispensaDados({ motivo: "Cartão consulta", urgencia: "normal" })).toBe(
      false,
    );
  });

  test("linhas do resumo mostram o que faltou", () => {
    expect(linhasDadosPaciente({ nome_completo: "Paciente Teste", data_nascimento: null })).toEqual(
      ["Nome completo: Paciente Teste", "Data de nascimento: não informada"],
    );
  });

  test("normalização tolera estado antigo ou inválido", () => {
    expect(normalizarTransferenciaPendente(null)).toBeNull();
    expect(
      normalizarTransferenciaPendente({ session_id: "s", em: "t", argumentos: {} }),
    ).toBeNull();
    expect(
      normalizarTransferenciaPendente({
        session_id: "s",
        em: "t",
        argumentos: { motivo: "AGENDAMENTO_TRANSICAO: x", setor: "Agendamento" },
      }),
    ).toEqual({
      session_id: "s",
      em: "t",
      argumentos: {
        motivo: "AGENDAMENTO_TRANSICAO: x",
        resumo: null,
        urgencia: null,
        setor: "Agendamento",
      },
    });
    expect(
      normalizarDadosPaciente({ nome_completo: "Paciente Teste", data_nascimento: "x" }),
    ).toEqual({ nome_completo: "Paciente Teste", data_nascimento: null });
    expect(normalizarDadosPaciente({})).toBeNull();
  });
});
