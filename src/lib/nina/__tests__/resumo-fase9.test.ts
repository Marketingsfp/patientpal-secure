import { describe, expect, test } from "bun:test";
import { escolhaNaConversa, profissionaisCitados } from "../escolha-paciente";
import { dadosDaConversa, extrairDadosTransferencia } from "../dados-transferencia";

// Fase 9 da homologação (ciclos 1206–1446, 15/10/2026). Dados fictícios.
const HOJE = new Date("2026-10-15T12:00:00Z");
const ler = (t: string) => extrairDadosTransferencia(t, HOJE);

const PROFISSIONAIS = [
  "MARINA TESTE DIAS",
  "LUCI DA COSTA TESTE",
  "ENEIDA TESTE RODRIGUES",
  "CLAUDIA MARIA TESTE SANTOS",
];

describe("escolha do paciente no resumo", () => {
  test("sobrenome que é palavra comum ou do paciente não vira escolha", () => {
    expect(
      profissionaisCitados("quais dias ela atende? quinta a tarde serve", PROFISSIONAIS),
    ).toEqual([]);
    expect(
      escolhaNaConversa(
        ["meu nome é Luciano Teste Costa, nasci 01/02/1980. quinta de manha"],
        PROFISSIONAIS,
      ).profissional,
    ).toBeNull();
    expect(profissionaisCitados("com a eneida na quinta", PROFISSIONAIS)).toEqual([
      "ENEIDA TESTE RODRIGUES",
    ]);
    expect(profissionaisCitados("pode ser com a dra dias", PROFISSIONAIS)).toEqual([
      "MARINA TESTE DIAS",
    ]);
    // "Maria" é o segundo nome da Claudia: sozinho não identifica ninguém.
    expect(profissionaisCitados("a maria me indicou", PROFISSIONAIS)).toEqual([]);
  });

  test("pagamento recusado não entra; vale a última forma aceita", () => {
    const pag = (t: string) => escolhaNaConversa([t], []).pagamento;
    expect(pag("credito 135, pix nao")).toBe("cartão de crédito");
    expect(pag("pago no debito, nao pix")).toBe("cartão de débito");
    expect(pag("debito 135 sem pix")).toBe("cartão de débito");
    expect(pag("no dinheiro20, nao cartao")).toBe("dinheiro");
    expect(pag("credito15 pode la?")).toBe("cartão de crédito");
  });

  test("dia recusado não entra; vale o último dia aceito", () => {
    const e = (t: string) => escolhaNaConversa([t], []);
    expect(e("quarta nao, prefiro sexta de manha").dia).toBe("sexta-feira");
    expect(e("na vdd vai ser segunda de manha e nao sexta").dia).toBe("segunda-feira");
    expect(e("ela vai sab cedo").dia).toBe("sábado");
    expect(e("ela vai sab cedo").periodo).toBe("manhã");
  });
});

describe("nome do paciente no resumo", () => {
  test("responsável apresenta o paciente de vários jeitos", () => {
    const nome = (t: string) => ler(t).nome_completo;
    expect(
      nome(
        "é pra minha mae Rita Teste Albuquerque, nasceu 14 de janeiro de 1951. eu sou Patricia.",
      ),
    ).toBe("Rita Teste Albuquerque");
    expect(
      nome("paciente minha irma Julia Teste Rocha, nasceu 5 de maio de 1994. eu sou Juliana."),
    ).toBe("Julia Teste Rocha");
    expect(nome("é o meu marido Paulo Teste Dias, 21 de junho de 1964, eu sou Renata.")).toBe(
      "Paulo Teste Dias",
    );
    expect(nome("sou esposo Daniel, ela Vera Teste Cardoso, nascimento: 18/02/1964.")).toBe(
      "Vera Teste Cardoso",
    );
    expect(nome("sou marido Fabio. paciente esposa Clara Teste Leme, nasceu em 08/04/1980.")).toBe(
      "Clara Teste Leme",
    );
    expect(
      nome("sou filha Paula. minha mãe paciente Sonia Teste Castro, 15 de maio de 1956."),
    ).toBe("Sonia Teste Castro");
    expect(nome("meu nome é André, o dele Pedro Teste Nunes. nasc dele 04/12/55")).toBe(
      "Pedro Teste Nunes",
    );
  });

  test("'meu nome Fulano' sem 'é', nome antes de 'nasc' e datas por partes", () => {
    expect(ler("meu nome joao teste lima, nasci 30/01/1962")).toEqual({
      nome_completo: "Joao Teste Lima",
      data_nascimento: "30/01/1962",
    });
    expect(ler("com receita sim. Maria Teste Silva nasc 11 de julho de 1971.").nome_completo).toBe(
      "Maria Teste Silva",
    );
    expect(ler("nasc dia 5 mes 6 ano 1987").data_nascimento).toBe("05/06/1987");
    expect(ler("nasceu dia7 do6 de1988").data_nascimento).toBe("07/06/1988");
  });

  test("frases comuns nunca viram nome; a mensagem com nome e data vale primeiro", () => {
    for (const frase of [
      "eu q to falando com vc",
      "o original levo no dia",
      "qnt custa",
      "rm de joelho",
    ])
      expect(ler(frase).nome_completo).toBeNull();
    expect(
      dadosDaConversa(
        ["eu q to falando com vc", "meu nome Rafael Teste Gomes, 13/05/1985", "Levo Pedido"],
        HOJE,
      ),
    ).toEqual({ nome_completo: "Rafael Teste Gomes", data_nascimento: "13/05/1985" });
  });
});
