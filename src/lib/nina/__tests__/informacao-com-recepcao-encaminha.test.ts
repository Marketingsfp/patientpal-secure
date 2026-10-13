import { describe, expect, test } from "bun:test";
import { separarOrientacaoRecepcao } from "../informacao-nao-cadastrada";
import { padronizarPerguntaPreferencia } from "../fluxo-agendamento-item";
import { estadoConferencia, perguntasConferencia, problemasConferencia } from "../jev-conferencia";

describe("sem a informação: encaminha em vez de dizer 'quem passa é a recepção'", () => {
  test("só a orientação: encaminha sem texto antes", () => {
    expect(
      separarOrientacaoRecepcao(
        "Sobre o preparo para a consulta com o gastroenterologista, quem passa essa informação é a nossa recepção.\nDeseja agendar a sua consulta para algum dos dias de atendimento ou tem mais alguma dúvida?",
        false,
      ),
    ).toEqual({ orientaRecepcao: true, restante: "" });
    expect(
      separarOrientacaoRecepcao(
        "Quem tira essa dúvida sobre levar exames anteriores é a nossa recepção.\nVocê gostaria de agendar a sua consulta com o Dr. Paciente Teste ou precisa de mais alguma informação?",
        false,
      ).orientaRecepcao,
    ).toBe(true);
  });

  test("respostas que a Nina tem seguem junto; a orientação e a pergunta final saem", () => {
    expect(
      separarOrientacaoRecepcao(
        "Sim, se o pagamento for em dinheiro, o valor é R$ 120,00.\nSobre a necessidade de pagamento prévio ou adiantado para reserva no caso de pagamento em dinheiro, quem passa essa informação é a nossa recepção (apenas o pagamento via Pix é que possui a condição de ser somente antecipado).\nGostaria de marcar a sua consulta ou posso ajudar com mais alguma questão?",
        false,
      ),
    ).toEqual({
      orientaRecepcao: true,
      restante: "Sim, se o pagamento for em dinheiro, o valor é R$ 120,00.",
    });
  });

  test("modalidade citada sem o paciente perguntar não dispara encaminhamento", () => {
    const r = separarOrientacaoRecepcao(
      "Temos Gastroenterologia.\nSobre a forma de atendimento (se hora marcada ou ordem de chegada), quem passa essa informação é a nossa recepção.",
      false,
    );
    expect(r.orientaRecepcao).toBe(false);
    // Com a pergunta do paciente sobre como funciona, dispara.
    expect(
      separarOrientacaoRecepcao(
        "Sobre a forma de atendimento (se hora marcada ou ordem de chegada), quem passa essa informação é a nossa recepção.",
        true,
      ).orientaRecepcao,
    ).toBe(true);
  });

  test("ofertas, promessas e informações comuns não disparam", () => {
    for (const texto of [
      "A Dra. Paciente Teste atende às quintas. Posso encaminhar para nossa equipe verificar o horário?",
      "Vou encaminhar você para a nossa equipe.",
      "Atendemos às quintas, das 10:30 às 13:00. Valor: R$ 145,00.",
    ])
      expect(separarOrientacaoRecepcao(texto, false).orientaRecepcao).toBe(false);
  });
});

describe("pergunta de preferência também no convite final para marcar", () => {
  const PADRAO =
    "Você tem preferência por algum profissional ou gostaria de marcar com o primeiro disponível?";
  test("com vários profissionais, o convite vira a pergunta padrão", () => {
    expect(
      padronizarPerguntaPreferencia(
        "Valores: R$ 120,00.\nVocê gostaria de marcar uma consulta ou ficou com alguma dúvida?",
        true,
      ),
    ).toBe(`Valores: R$ 120,00.\n${PADRAO}`);
  });
  test("com um profissional só, o convite fica como está", () => {
    const t =
      "Valores: R$ 120,00.\nVocê gostaria de marcar uma consulta ou ficou com alguma dúvida?";
    expect(padronizarPerguntaPreferencia(t, false)).toBe(t);
  });
});

describe("Jev confere pergunta do paciente sem resposta", () => {
  const fatos = {
    agendaConsultada: false,
    agendamentoConfirmado: false,
    dadosConsultados: [],
    mensagemPaciente:
      "Ela tem 16 anos. Essas profissionais atendem adolescentes ou tem alguma restrição de idade?",
  };
  test("a pergunta nova só entra quando há mensagem do paciente", () => {
    expect(perguntasConferencia(fatos).pergunta_sem_resposta).toBeDefined();
    expect(
      perguntasConferencia({ ...fatos, mensagemPaciente: undefined }).pergunta_sem_resposta,
    ).toBeUndefined();
    expect(estadoConferencia("texto", fatos).mensagem_paciente).toContain("16 anos");
  });
  test("confiança de 80% ou mais vira encaminhamento; abaixo disso, não", () => {
    expect(
      problemasConferencia({ pergunta_sem_resposta: { type: "noul", noul: 0.9 } } as never, fatos),
    ).toContain("pergunta_sem_resposta");
    expect(
      problemasConferencia({ pergunta_sem_resposta: { type: "noul", noul: 0.75 } } as never, fatos),
    ).not.toContain("pergunta_sem_resposta");
  });
  test("a resposta das 19:15 não leva convite nem pergunta junto do encaminhamento", () => {
    expect(
      separarOrientacaoRecepcao(
        "Você gostaria de agendar? Caso tenha preferência, me informe se deseja o primeiro horário disponível ou com alguma profissional específica.",
        false,
      ),
    ).toEqual({ orientaRecepcao: false, restante: "" });
  });
});
