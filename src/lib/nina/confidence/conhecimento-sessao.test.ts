import { describe, expect, test } from "bun:test";
import {
  conhecimentoDaMesmaSessao,
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
