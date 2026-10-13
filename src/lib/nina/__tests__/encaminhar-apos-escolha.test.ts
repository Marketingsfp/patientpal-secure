import { describe, expect, test } from "bun:test";
import {
  afirmaEncaminhamento,
  escolhaParaAgendar,
  intencaoDeAgendarNaSessao,
  removerOfertaDeEncaminhamento,
} from "../fluxo-agendamento-item";

const NOMES = ["IARMILA RUZENA KRASNY", "FELIPE MOURA CORREA"];

describe("informar, esperar e encaminhar na escolha do paciente", () => {
  test("a mensagem de informações perde só a oferta de encaminhamento", () => {
    const texto =
      "Atendemos com Endocrinologia sim!\n\nValores: Dinheiro R$ 120,00.\n\nVocê tem preferência por algum dos profissionais ou dias da semana?\nPosso encaminhar para nossa equipe confirmar o seu horário?";
    expect(removerOfertaDeEncaminhamento(texto)).toBe(
      "Atendemos com Endocrinologia sim!\n\nValores: Dinheiro R$ 120,00.\n\nVocê tem preferência por algum dos profissionais ou dias da semana?",
    );
    expect(
      removerOfertaDeEncaminhamento(
        "A Dra. Paciente Teste atende às quintas-feiras.\n\nPosso encaminhar a sua conversa para a nossa equipe verificar o agendamento para quinta?",
      ),
    ).toBe("A Dra. Paciente Teste atende às quintas-feiras.");
    // Sem oferta, nada muda; nunca esvazia a resposta.
    expect(removerOfertaDeEncaminhamento("Atendemos às quintas.")).toBe("Atendemos às quintas.");
    expect(removerOfertaDeEncaminhamento("Posso encaminhar para a equipe?")).toBe(
      "Posso encaminhar para a equipe?",
    );
  });

  test("escolha de dia, horário ou profissional é pedido de marcar", () => {
    expect(
      escolhaParaAgendar(
        "Quinta com a Dra. Iarmila fica boa pra mim. Dá pra dividir no cartão?",
        NOMES,
      ),
    ).toBe(true);
    expect(escolhaParaAgendar("Entendi. Então pode deixar pra quinta com ela.", NOMES)).toBe(true);
    expect(escolhaParaAgendar("pode ser com o Felipe", NOMES)).toBe(true);
    expect(escolhaParaAgendar("quinta às 10h", NOMES)).toBe(true);
    // Perguntas e respostas sem escolha não encaminham.
    expect(escolhaParaAgendar("A Iarmila atende na quinta?", NOMES)).toBe(false);
    expect(escolhaParaAgendar("Quanto custa a consulta?", NOMES)).toBe(false);
    expect(escolhaParaAgendar("Entendi, obrigado", NOMES)).toBe(false);
  });

  test("despedida não continua o agendamento da sessão", () => {
    const base = { intencaoNoTurno: false, sessaoComIntencao: true, intencoesTurno: [] };
    expect(intencaoDeAgendarNaSessao({ ...base, mensagem: "Entendi." })).toBe(true);
    expect(intencaoDeAgendarNaSessao({ ...base, mensagem: "Ok, obrigado" })).toBe(false);
    expect(intencaoDeAgendarNaSessao({ ...base, mensagem: "Vou pensar e depois eu volto" })).toBe(
      false,
    );
  });

  test("a promessa de encaminhamento da IA é reconhecida", () => {
    expect(
      afirmaEncaminhamento(
        "Combinado!\n\nNossa equipe de atendimento vai dar continuidade para verificar a disponibilidade e confirmar o seu horário com a Dra. Iarmila para quinta-feira.\n\nPor favor, aguarde só um momento que logo você será atendido!",
      ),
    ).toBe(true);
    expect(afirmaEncaminhamento("Vou encaminhar você para a nossa equipe.")).toBe(true);
    // Pergunta ou informação não é promessa.
    expect(afirmaEncaminhamento("Posso encaminhar para nossa equipe?")).toBe(false);
    expect(afirmaEncaminhamento("A Dra. Iarmila atende às quintas, das 10:30 às 13:00.")).toBe(
      false,
    );
    expect(
      afirmaEncaminhamento(
        "As condições de parcelamento são confirmadas diretamente com a nossa equipe de atendimento.",
      ),
    ).toBe(false);
  });
});
