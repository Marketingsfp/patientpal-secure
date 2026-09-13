import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";

describe("pergunta curta sobre forma de pagamento no atendimento", () => {
  for (const mensagemPaciente of [
    "aceita PIX?",
    "Vocês aceitam dinheiro?",
    "Posso pagar com cartão?",
    "e no pix?",
    "quais as formas de pagamento?",
    "Aceitam boleto?",
  ]) {
    it(`${mensagemPaciente} é informação de pagamento, sem ação operacional`, () => {
      const c = montarContextoCanonicoTurno(
        { mensagemPaciente, podeAgendar: true },
        { detectarIntencoes, intencaoAmbigua },
      );
      expect(c.intentAmbiguo).toBe(false);
      expect(c.turnType).toBe("INFORMACAO");
      expect(c.requestedAction).toBe("informar_valor");
    });
  }
});
