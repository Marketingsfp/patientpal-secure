import { describe, expect, test } from "bun:test";
import { pacientePerguntouModalidade } from "../modalidade-nao-informada";
import {
  perguntaGenerica,
  removerOrientacaoRecepcao,
  separarOrientacaoRecepcao,
} from "../informacao-nao-cadastrada";
import {
  listaProfissionaisExtensa,
  pedeFiltroPorGenero,
  pedeListaDeProfissionais,
} from "../lista-profissionais-extensa";
import { cartaoDePagamento } from "../cartao-consulta";

describe("frase vaga não é pergunta de modalidade nem pergunta sem resposta", () => {
  test("'como funciona aí?' sozinho não é modalidade", () => {
    expect(
      pacientePerguntouModalidade(
        "Olá! Queria uma consulta com gastro. Vocês têm esse atendimento? Ainda não sei como funciona aí.",
      ),
    ).toBe(false);
    expect(pacientePerguntouModalidade("Como funciona aí?")).toBe(false);
    // Perguntas de modalidade de verdade continuam.
    expect(pacientePerguntouModalidade("É por ordem de chegada?")).toBe(true);
    expect(
      pacientePerguntouModalidade("Precisa reservar um horário antes ou é só chegar no dia?"),
    ).toBe(true);
    expect(pacientePerguntouModalidade("Como funciona o atendimento, é hora marcada?")).toBe(true);
  });

  test("perguntas genéricas", () => {
    for (const t of [
      "Olá! Queria uma consulta com gastro. Vocês têm esse atendimento? Ainda não sei como funciona aí.",
      "Olá, queria saber se vocês fazem lavagem de ouvido. Como funciona aí?",
      "Olá, estou com um pedido de ultrassom transvaginal, sem Doppler. Vocês fazem?",
      "Oi, queria uma consulta particular com clínico geral. Como vocês atendem?",
    ])
      expect(perguntaGenerica(t)).toBe(true);
    for (const t of [
      "Esse valor é só da consulta ou o médico também pode avaliar meu grau dos óculos?",
      "Precisa de jejum ou algum preparo?",
      "A consulta tem retorno incluído?",
      "Quero marcar com a Dra. Paciente Teste.",
    ])
      expect(perguntaGenerica(t)).toBe(false);
  });

  test("orientação sobre o que o paciente não perguntou sai sem mexer no resto", () => {
    expect(
      removerOrientacaoRecepcao(
        "Temos sim consulta com gastroenterologista.\nSobre o funcionamento do atendimento, quem passa a forma exata de atendimento é a nossa recepção.\nVocê tem preferência por algum profissional ou gostaria de marcar com o primeiro disponível?",
      ),
    ).toBe(
      "Temos sim consulta com gastroenterologista.\nVocê tem preferência por algum profissional ou gostaria de marcar com o primeiro disponível?",
    );
  });

  test("'forma exata de atendimento' é assunto de modalidade (ciclo 1167)", () => {
    expect(
      separarOrientacaoRecepcao(
        "Sim, a consulta é presencial na nossa unidade.\n\nQuem informa a forma exata de atendimento (como funciona a chamada no dia) é a nossa recepção.",
        false,
      ).orientaRecepcao,
    ).toBe(false);
  });
});

describe("regra dos mais de 8 só quando o paciente pede a lista", () => {
  const ARGS = JSON.stringify({ termo: "cardiologia", objetivos: ["medicos"] });
  const DADOS = { doctors: Array.from({ length: 9 }, (_, i) => `Profissional Teste ${i}`) };

  test("pedido de lista", () => {
    expect(
      pedeListaDeProfissionais(
        "Não conheço os profissionais ainda. Queria saber os nomes e os dias para escolher com calma, pode me mostrar?",
      ),
    ).toBe(true);
    expect(pedeListaDeProfissionais("Quais são os médicos?")).toBe(true);
    expect(pedeListaDeProfissionais("Em dinheiro fica 120 com qualquer um desses médicos?")).toBe(
      false,
    );
    expect(pedeListaDeProfissionais("Oi, estou procurando uma consulta com cardiologista.")).toBe(
      false,
    );
  });

  test("filtro por médica ou médico não é lista extensa", () => {
    expect(pedeFiltroPorGenero("Ela prefere uma médica. Quais dessas opções são médicas?")).toBe(
      true,
    );
    expect(pedeFiltroPorGenero("Prefiro um médico homem, vocês têm alguma opção?")).toBe(true);
    expect(pedeFiltroPorGenero("Quero uma consulta médica, quais são os médicos?")).toBe(false);
  });

  test("a regra só vale com o pedido de lista na mensagem", () => {
    expect(
      listaProfissionaisExtensa("consultar_cadastro", ARGS, DADOS, "Quais são os médicos?"),
    ).not.toBeNull();
    expect(
      listaProfissionaisExtensa(
        "consultar_cadastro",
        ARGS,
        DADOS,
        "Em dinheiro fica 120 com qualquer um desses médicos?",
      ),
    ).toBeNull();
    expect(
      listaProfissionaisExtensa(
        "consultar_cadastro",
        ARGS,
        DADOS,
        "Ela prefere uma médica. Quais dessas opções são médicas?",
      ),
    ).toBeNull();
    // Sem a mensagem, o comportamento anterior continua.
    expect(listaProfissionaisExtensa("consultar_cadastro", ARGS, DADOS)).not.toBeNull();
  });
});

describe("cartão de pagamento não é cartão consulta", () => {
  test("pagamento", () => {
    expect(cartaoDePagamento("O preço no cartão é o mesmo com todas essas médicas?")).toBe(true);
    expect(cartaoDePagamento("Aceita cartão de crédito?")).toBe(true);
    expect(cartaoDePagamento("No cartão fica 145 e pago na recepção?")).toBe(true);
  });
  test("cartão consulta continua com a equipe", () => {
    expect(cartaoDePagamento("Meu cartão de desconto venceu, quero renovar.")).toBe(false);
    expect(cartaoDePagamento("Quero colocar minha mãe no meu cartão como dependente.")).toBe(false);
    expect(cartaoDePagamento("Quanto fica com o cartão consulta?")).toBe(false);
  });
});
