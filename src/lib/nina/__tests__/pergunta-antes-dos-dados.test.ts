import { describe, expect, test } from "bun:test";
import { perguntaEmVezDosDados, respostaAntesDaTransferencia } from "../dados-transferencia";

describe("transferência aguardando dados: pergunta em vez dos dados", () => {
  test("caso de 13/10 22:38: pergunta sem os dados", () => {
    expect(
      perguntaEmVezDosDados(
        "Antes de passar meus dados, preciso saber se vocês fazem essa consulta e quanto custa. É consulta com alergista mesmo.",
      ),
    ).toBe(true);
    expect(perguntaEmVezDosDados("Quanto custa a consulta?")).toBe(true);
  });

  test("dados enviados ou resposta sem pergunta seguem a transferência normal", () => {
    expect(perguntaEmVezDosDados("Paciente Teste da Silva, 01/01/1990")).toBe(false);
    expect(perguntaEmVezDosDados("Paciente Teste da Silva, 01/01/1990. Quanto custa?")).toBe(false);
    expect(perguntaEmVezDosDados("ok")).toBe(false);
    expect(perguntaEmVezDosDados("não quero passar")).toBe(false);
  });

  test("a resposta segue sem pergunta final, promessa ou novo pedido de dados", () => {
    expect(
      respostaAntesDaTransferencia(
        "Sim, temos consulta com a Dra. Paciente Teste. O valor é R$ 145,00.\nVou encaminhar você para a nossa equipe.\nMe envie seu nome completo e data de nascimento, por favor.\nPosso ajudar em algo mais?",
      ),
    ).toBe("Sim, temos consulta com a Dra. Paciente Teste. O valor é R$ 145,00.");
    expect(respostaAntesDaTransferencia("Você gostaria de agendar?")).toBe("");
  });
});
