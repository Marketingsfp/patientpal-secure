import { describe, expect, test } from "bun:test";
import {
  afirmaEncaminhamento,
  escolhaParaAgendar,
  intencaoDeAgendarNaSessao,
  padronizarPerguntaPreferencia,
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
    // "Dra." não termina a frase: a oferta sai inteira, sem deixar "com a Dra." solto.
    expect(
      removerOfertaDeEncaminhamento(
        "Sim, o pagamento por Pix precisa ser realizado antecipadamente.\n\nComo você tem preferência pelo atendimento com a Dra. Paciente Teste no sábado, posso encaminhar a sua solicitação para a nossa equipe agendar para você?",
      ),
    ).toBe("Sim, o pagamento por Pix precisa ser realizado antecipadamente.");
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

describe("pergunta de preferência no modelo", () => {
  const PADRAO =
    "Você tem preferência por algum profissional ou gostaria de marcar com o primeiro disponível?";
  test("variações da IA viram a pergunta padrão", () => {
    expect(
      padronizarPerguntaPreferencia(
        "Valores: R$ 120,00.\n\nVocê tem preferência por alguma das profissionais, ou por algum dia da semana específico para a sua consulta?",
      ),
    ).toBe(`Valores: R$ 120,00.\n\n${PADRAO}`);
    expect(
      padronizarPerguntaPreferencia(
        "Temos Cardiologia. Você prefere o primeiro horário disponível ou deseja escolher entre os profissionais?",
      ),
    ).toBe(`Temos Cardiologia. ${PADRAO}`);
    expect(padronizarPerguntaPreferencia(PADRAO)).toBe(PADRAO);
  });
  test("outras perguntas ficam como estão", () => {
    for (const t of [
      "Atende às quintas. Você gostaria de agendar uma consulta?",
      "Qual o seu nome completo?",
      "Atende às quintas.",
    ])
      expect(padronizarPerguntaPreferencia(t)).toBe(t);
  });
  test("'o primeiro disponível' e 'qualquer um' são escolha para marcar", () => {
    expect(escolhaParaAgendar("Pode ser o primeiro disponível", [])).toBe(true);
    expect(escolhaParaAgendar("qualquer um", [])).toBe(true);
    expect(escolhaParaAgendar("tem o primeiro disponível no sábado?", [])).toBe(false);
  });
});
