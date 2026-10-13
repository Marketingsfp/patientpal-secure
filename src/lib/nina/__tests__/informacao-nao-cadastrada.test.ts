import { describe, expect, test } from "bun:test";
import {
  corrigirInformacaoNaoCadastrada,
  TEXTO_INFORMACAO_PELA_RECEPCAO,
} from "../informacao-nao-cadastrada";

describe("informação que o cadastro não traz: quem passa é a recepção", () => {
  test("frases reais que expõem a falta de cadastro viram a orientação da recepção", () => {
    expect(
      corrigirInformacaoNaoCadastrada(
        "O atendimento nutricional é para o público geral, sem restrição de gênero cadastrada.\n\nVocê tem preferência por alguma das profissionais?",
      ),
    ).toBe(
      `${TEXTO_INFORMACAO_PELA_RECEPCAO}\n\nVocê tem preferência por alguma das profissionais?`,
    );
    expect(
      corrigirInformacaoNaoCadastrada(
        "*Preparo:* Não há nenhum preparo cadastrado para esta consulta.",
      ),
    ).toBe(`*Preparo:* ${TEXTO_INFORMACAO_PELA_RECEPCAO}`);
    expect(
      corrigirInformacaoNaoCadastrada(
        "A modalidade exata da Dra. Paciente Teste não consta no nosso sistema. Atende às quintas.",
      ),
    ).toBe(`${TEXTO_INFORMACAO_PELA_RECEPCAO} Atende às quintas.`);
    expect(corrigirInformacaoNaoCadastrada("Não tenho essa informação no momento.")).toBe(
      TEXTO_INFORMACAO_PELA_RECEPCAO,
    );
  });

  test("idade sem restrição (IDADE-01): a frase sai, sem trocar pela recepção", () => {
    expect(
      corrigirInformacaoNaoCadastrada(
        "Sim, atendemos crianças! A consulta de Ortopedia não possui restrição de idade cadastrada.\n\nValores: R$ 120,00.",
      ),
    ).toBe("Sim, atendemos crianças!\n\nValores: R$ 120,00.");
  });

  test("uma troca só por resposta; texto com informação do cadastro fica igual", () => {
    expect(
      corrigirInformacaoNaoCadastrada(
        "O preparo não está cadastrado. O pedido médico também não consta no sistema.",
      ),
    ).toBe(TEXTO_INFORMACAO_PELA_RECEPCAO);
    const t = "A Dra. Paciente Teste atende às quintas, das 10:30 às 13:00. Valor: R$ 145,00.";
    expect(corrigirInformacaoNaoCadastrada(t)).toBe(t);
    expect(corrigirInformacaoNaoCadastrada("Não temos atendimento aos sábados.")).toBe(
      "Não temos atendimento aos sábados.",
    );
  });
});
