import { describe, expect, test } from "bun:test";
import {
  escolhaParaAgendar,
  padronizarPerguntaPreferencia,
  semPreferenciaDeProfissional,
} from "../fluxo-agendamento-item";
import { separarOrientacaoRecepcao } from "../informacao-nao-cadastrada";

const PADRAO =
  "Você tem preferência por algum profissional ou gostaria de marcar com o primeiro disponível?";

describe("sem preferência de profissional vale como primeiro disponível", () => {
  test("frases da homologação de 13/10 22:06 e 22:07", () => {
    expect(
      semPreferenciaDeProfissional(
        "Não tenho um médico específico porque ainda não conheço ninguém daí. O cartão precisa ser pago antes ou posso pagar quando for?",
      ),
    ).toBe(true);
    expect(
      semPreferenciaDeProfissional(
        "Pode ser quem conseguir me atender antes. Como não conheço os médicos ainda, não tenho preferência por nenhum.",
      ),
    ).toBe(true);
  });

  test("outras formas de dizer", () => {
    for (const t of [
      "não tenho preferência",
      "Sem preferência",
      "não tenho nenhum médico em mente",
      "qualquer médico serve",
      "quero marcar o mais cedo possível",
      "Pode ser o primeiro disponível",
    ])
      expect(semPreferenciaDeProfissional(t)).toBe(true);
  });

  test("pergunta, preferência por alguém ou outro assunto não contam", () => {
    for (const t of [
      "tem o primeiro disponível no sábado?",
      "Não tenho preferência pela manhã, mas pela Dra. Paciente Teste sim",
      "Não, tenho preferência pelo Dr. Paciente Teste",
      "Quanto custa a consulta?",
      "Prefiro a Dra. Paciente Teste",
    ])
      expect(semPreferenciaDeProfissional(t)).toBe(false);
  });

  test("é escolha para marcar mesmo com dúvida na mesma mensagem", () => {
    expect(escolhaParaAgendar("Não tenho médico específico. O cartão é pago antes?", [])).toBe(
      true,
    );
    expect(escolhaParaAgendar("tem o primeiro disponível no sábado?", [])).toBe(false);
  });

  test("a resposta da dúvida segue sem a pergunta de dia ou preferência", () => {
    expect(
      separarOrientacaoRecepcao(
        "O pagamento no cartão pode ser realizado presencialmente na clínica, no momento do seu atendimento.\n\nComo você não tem preferência por um profissional, em qual dia da semana ou período (manhã ou tarde) fica melhor para você ser atendido?",
        false,
      ).restante,
    ).toBe(
      "O pagamento no cartão pode ser realizado presencialmente na clínica, no momento do seu atendimento.",
    );
  });
});

describe("pergunta padrão também quando vem como pedido", () => {
  test("caso de 13/10 22:05: 'me informe… (ou se prefere escolher um médico específico).'", () => {
    expect(
      padronizarPerguntaPreferencia(
        "Temos diversos profissionais que atendem nessa especialidade.\n\nPara agendarmos sua consulta, por favor, me informe o dia ou período da semana de sua preferência (ou se prefere escolher um médico específico).",
        true,
      ),
    ).toBe(`Temos diversos profissionais que atendem nessa especialidade.\n\n${PADRAO}`);
  });

  test("com um profissional só ou sem pedido de preferência, fica igual", () => {
    const pedido =
      "Atende às quintas. Me informe o dia de sua preferência (ou se prefere escolher um médico específico).";
    expect(padronizarPerguntaPreferencia(pedido, false)).toBe(pedido);
    const info = "Atende às quintas. Me informe se precisar de algo.";
    expect(padronizarPerguntaPreferencia(info, true)).toBe(info);
  });
});
