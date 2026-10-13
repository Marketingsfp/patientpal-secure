import { describe, expect, test } from "bun:test";
import {
  corrigirSuposicaoPedidoMedico,
  REGRA_PEDIDO_MEDICO_NAO_INFORMADO,
} from "../pedido-medico-recepcao";
import { REGRA_AGENDAMENTO_POR_ITEM, REGRA_TRANSICAO_AGENDAMENTO } from "../transicao-agendamento";

describe("pedido médico não informado: quem tira a dúvida é a recepção", () => {
  test("troca a suposição da linha 'Pedido médico:' e mantém o resto", () => {
    const texto =
      "Para a consulta com a Dra. Paciente Teste (Otorrinolaringologia):\n*Preparo:* Não há nenhum preparo cadastrado para esta consulta.\n*Pedido médico:* Por ser uma consulta médica particular, geralmente não é necessário pedido prévio (a menos que seja uma exigência do seu plano).\nVocê deseja dar continuidade e marcar a sua consulta?";
    expect(corrigirSuposicaoPedidoMedico(texto)).toBe(
      "Para a consulta com a Dra. Paciente Teste (Otorrinolaringologia):\n*Preparo:* Não há nenhum preparo cadastrado para esta consulta.\n*Pedido médico:* Quem tira essa dúvida é a nossa recepção.\nVocê deseja dar continuidade e marcar a sua consulta?",
    );
  });

  test("frase solta com suposição é trocada; o resto da linha fica", () => {
    expect(
      corrigirSuposicaoPedidoMedico(
        "Atende às segundas. Normalmente não precisa de pedido médico para essa consulta.",
      ),
    ).toBe("Atende às segundas. Sobre o pedido médico, quem tira essa dúvida é a nossa recepção.");
  });

  test("informação do cadastro, sem suposição, fica igual", () => {
    const t = "*Pedido médico:* obrigatório para realizar este exame.";
    expect(corrigirSuposicaoPedidoMedico(t)).toBe(t);
    expect(corrigirSuposicaoPedidoMedico("Atendemos às quintas.")).toBe("Atendemos às quintas.");
  });

  test("a regra entra nas instruções de agendamento", () => {
    expect(REGRA_TRANSICAO_AGENDAMENTO).toContain(REGRA_PEDIDO_MEDICO_NAO_INFORMADO);
    expect(REGRA_AGENDAMENTO_POR_ITEM).toContain(REGRA_PEDIDO_MEDICO_NAO_INFORMADO);
  });
});
