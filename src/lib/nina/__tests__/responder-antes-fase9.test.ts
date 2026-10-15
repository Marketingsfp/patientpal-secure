import { describe, expect, test } from "bun:test";
import {
  INSTRUCAO_RESPONDER_E_ENCAMINHAR,
  perguntaJuntoDaEscolha,
  respostaAntesDaTransferencia,
} from "../dados-transferencia";

// Fase 9 (homologação 15/10/2026): escolha com pergunta na mesma mensagem.
describe("escolha com pergunta junto", () => {
  test("frases dos ciclos em que a pergunta ficava sem resposta", () => {
    for (const frase of [
      "essa eneida de quinta serve. é 150 no debito tb? n quero consulta, so a lavagen",
      "samuel quarta de manha ta bom, os 120 é debito tb",
      "quarta21 de manha com sandro, e no credito tbm 15",
      "sabado cedo com a cintia, é por ordem de chegada",
      "isso pode seguir com ela sexta de manha, pago la na hora",
      "pode ser a iara, quanto fica no cartao",
    ])
      expect(perguntaJuntoDaEscolha(frase)).toBe(true);
  });

  test("escolha sem pergunta continua indo direto para os dados", () => {
    for (const frase of [
      "pode seguir com ela sexta de manha",
      "isso vamo seguir com a mariana quinta de manha entao",
      "sabado de manha com ela fica bom entao, quero seguir com esse",
      "entendi, vamo seguir sexta de manha com a enfermagem",
    ])
      expect(perguntaJuntoDaEscolha(frase)).toBe(false);
  });

  test("a resposta da IA segue sem pedido de dados nem promessa de encaminhar", () => {
    expect(
      respostaAntesDaTransferencia(
        "Sim, no débito o valor é R$ 150,00.\n\nVou encaminhar você para a nossa equipe. Me envie seu nome completo e sua data de nascimento.",
      ),
    ).toBe("Sim, no débito o valor é R$ 150,00.");
    expect(INSTRUCAO_RESPONDER_E_ENCAMINHAR).toMatch(/Não peça nome nem data de nascimento/);
  });
});
