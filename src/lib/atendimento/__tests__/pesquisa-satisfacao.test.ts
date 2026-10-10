import { describe, expect, it } from "bun:test";
import {
  classificarMensagemAposPesquisa,
  interpretarNotaSatisfacao,
  MENSAGEM_PESQUISA_SATISFACAO,
  PRAZO_RESPOSTA_PESQUISA_MS,
} from "../pesquisa-satisfacao";

describe("Pesquisa de satisfação", () => {
  it("mantém a resposta pendente por 24 horas", () => {
    expect(PRAZO_RESPOSTA_PESQUISA_MS).toBe(24 * 60 * 60 * 1000);
  });

  it("aceita somente uma nota isolada de 1 a 5", () => {
    expect(interpretarNotaSatisfacao(" 5 ")).toBe(5);
    expect(interpretarNotaSatisfacao("1")).toBe(1);
    for (const valor of ["0", "6", "nota 5", "5 estrelas", "", null])
      expect(interpretarNotaSatisfacao(valor)).toBeNull();
  });

  it("encaminha novos pedidos para o atendimento mesmo com pesquisa pendente", () => {
    for (const mensagem of [
      "Quero um novo atendimento",
      "Preciso marcar uma consulta",
      "Bom dia",
      "Quero 1 consulta",
      "5, quero agendar novamente",
    ]) {
      expect(classificarMensagemAposPesquisa(mensagem)).toEqual({ destino: "atendimento" });
    }
  });

  it("consome respostas inequívocas da pesquisa sem abrir atendimento", () => {
    for (let nota = 1; nota <= 5; nota++) {
      expect(classificarMensagemAposPesquisa(String(nota))).toEqual({
        destino: "pesquisa",
        nota,
      });
    }
  });

  it("informa o encerramento e apresenta todas as opções", () => {
    expect(MENSAGEM_PESQUISA_SATISFACAO).toContain("atendimento foi encerrado");
    for (let nota = 1; nota <= 5; nota++)
      expect(MENSAGEM_PESQUISA_SATISFACAO).toContain(`${nota} -`);
  });
});
