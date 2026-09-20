import { describe, expect, test } from "bun:test";
import {
  conhecimentoDaMesmaSessao,
  lembrarConsultaComprovada,
  consultaDoNovoTurno,
  type ConhecimentoSessao,
} from "./conhecimento-sessao";

const anterior: ConhecimentoSessao = {
  versao: 1,
  clinicaId: "clinica-teste",
  sessionId: "sessao-teste",
  consulta: { termo: "ortopedia", medico: "Jorge Ribeiro", dia: "segunda" },
  referencias: [
    {
      registro: "catalogo-jorge",
      versao: "v1",
      procedimento: "Ortopedia",
      medicoNome: "Jorge Ribeiro",
    },
  ],
};

describe("continuidade da pesquisa de conhecimento", () => {
  test.each(["consulta", "exame_procedimento"] as const)("preserva a categoria %s na referência da sessão", (tipo_atendimento) => {
    const memoria = lembrarConsultaComprovada({
      clinicaId: anterior.clinicaId, sessionId: anterior.sessionId,
      args: { termo: "cardiologia", tipo_atendimento }, fatos: [],
      esclarecimento: { tipo: "profissional", pergunta: "Qual profissional?", opcoes: [] },
    });
    const normalizada = conhecimentoDaMesmaSessao(memoria, anterior.clinicaId, anterior.sessionId);
    expect(normalizada?.consulta).toEqual({ termo: "cardiologia", tipo_atendimento });
  });
  test.each([
    "sim",
    "sim por favor",
    "Sim, por favor!",
    "claro, por gentileza",
    "pode verificar, por favor",
    "ok, se possível",
    "quero agendar pra segunda",
  ])("%s reconsulta o assunto e o médico anteriores", (mensagem) => {
    expect(consultaDoNovoTurno({ mensagem, anterior })).toEqual({
      args: { termo: "ortopedia", medico: "Jorge Ribeiro" },
      continuidade: true,
    });
  });

  test.each([
    "sim, por favor, ultrassom",
    "quero agendar um cardiologista",
    "prefiro Jose Roberto",
  ])("%s não ignora uma mudança explícita", (mensagem) => {
    expect(consultaDoNovoTurno({ mensagem, anterior })).toEqual({
      args: { termo: mensagem },
      continuidade: false,
    });
  });

  test("sem memória da sessão não recupera médico de outra conversa", () => {
    const memoria = conhecimentoDaMesmaSessao(anterior, anterior.clinicaId, "outra-sessao");
    expect(
      consultaDoNovoTurno({ mensagem: "sim por favor", anterior: memoria })?.continuidade,
    ).toBe(false);
  });
});

describe("continuidade de esclarecimentos do catálogo", () => {
  const pendente: ConhecimentoSessao = {
    ...anterior, consulta: { termo: "USG" },
    referencias: [
      { registro: "usg-tireoide", versao: null, procedimento: "Ultrassonografia de tireoide", medicoNome: null },
      { registro: "usg-abdome", versao: null, procedimento: "Ultrassonografia de abdome total", medicoNome: null },
    ],
    esclarecimento: { tipo: "procedimento", pergunta: "Qual exame?", opcoes: [
      { id: "usg-tireoide", nome: "Ultrassonografia de tireoide" },
      { id: "usg-abdome", nome: "Ultrassonografia de abdome total" },
    ] },
  };
  test("resposta curta conserva a família do exame e reconsulta a opção completa", () => {
    const memoria = conhecimentoDaMesmaSessao(pendente, anterior.clinicaId, anterior.sessionId);
    expect(consultaDoNovoTurno({ mensagem: "o de tireoide", anterior: memoria })).toEqual({
      args: { termo: "Ultrassonografia de tireoide" }, continuidade: true,
    });
  });
  test("sim não escolhe arbitrariamente entre duas opções", () => {
    expect(consultaDoNovoTurno({ mensagem: "sim", anterior: pendente })?.args.termo).toBe("USG");
  });
  test("outro procedimento e negação não viram confirmação da opção anterior", () => {
    for (const mensagem of ["quero mamografia", "não quero o de tireoide"])
      expect(consultaDoNovoTurno({ mensagem, anterior: pendente })?.continuidade).toBe(false);
  });
  test("homônimos esclarecidos pela unidade usam ID distinto, não só o nome", () => {
    const memoria: ConhecimentoSessao = { ...pendente, esclarecimento: {
      tipo: "profissional", pergunta: "Qual profissional?", opcoes: [
        { id: "medico-1", nome: "João Silva", especialidade: "Cardiologia", unidade: "Centro" },
        { id: "medico-2", nome: "João Silva", especialidade: "Cardiologia", unidade: "Norte" },
      ],
    } };
    expect(consultaDoNovoTurno({ mensagem: "da unidade Norte", anterior: memoria })).toEqual({
      args: { termo: "Cardiologia", medico: "medico-2" }, continuidade: true,
    });
  });
});

test("ordinal responde à lista de procedimentos, sem virar escolha de horário", () => {
  const memoria: ConhecimentoSessao = { ...anterior, esclarecimento: {
    tipo: "procedimento", pergunta: "Qual exame?", opcoes: [
      { id: "a", nome: "Ultrassonografia de abdome total" }, { id: "b", nome: "Ultrassonografia de tireoide" },
    ],
  } };
  expect(consultaDoNovoTurno({ mensagem: "o segundo", anterior: memoria })).toEqual({
    args: { termo: "Ultrassonografia de tireoide" }, continuidade: true,
  });
});

test.each(["sim", "isso mesmo", "sim esse mesmo", "é esse", "pode ser", "s"])("confirmação contextual de uma única sugestão: %s", (mensagem) => {
  const memoria: ConhecimentoSessao = { ...anterior, esclarecimento: {
    tipo: "profissional", pergunta: "Você se refere ao Dr. Jorge Ribeiro?", opcoes: [
      { id: "medico-jorge", nome: "Jorge Ribeiro", especialidade: "Ortopedia" },
    ],
  } };
  expect(consultaDoNovoTurno({ mensagem, anterior: memoria })?.args).toEqual({
    termo: "Ortopedia", medico: "medico-jorge",
  });
});
