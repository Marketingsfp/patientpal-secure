import { describe, expect, test } from "bun:test";
import {
  argumentosComDados,
  dadosDaConversa,
  extrairDadosTransferencia,
} from "../dados-transferencia";

const HOJE = new Date("2026-10-14T12:00:00Z");
const ler = (t: string) => extrairDadosTransferencia(t, HOJE);

describe("nome do paciente: frases e nomes de médico não viram nome (homologação 14/10)", () => {
  test("frases sem nome ficam 'não informado'", () => {
    for (const t of [
      "Pensando melhor, vou deixar a dermatologia para depois. Quero nutricionista.",
      "Queria conhecer os médicos e o valor primeiro. Você consegue me passar essas informações?",
      "Entendi. Então quero clínico geral mesmo. Quais opções vocês têm e qual o valor?",
      "Quinta de manhã com o Dr. Medico Teste é uma boa opção para mim.",
      "Sexta de manhã com o Marcelo fica bom. Quero seguir.",
      "A quinta à tarde com a Eneida poderia ser para mim. É esse mesmo valor com ela?",
      "Antes de passar meus dados, quanto custa? Tem mais de um cardiologista para eu escolher?",
    ])
      expect(ler(t).nome_completo).toBeNull();
  });

  test("escolha com nome de médico antes do nome do paciente", () => {
    expect(
      ler(
        "Vou escolher o Dr. Medico Teste Silva na terça de manhã, conforme você apresentou. Nome do paciente: Paciente Teste Caio. Meu filho nasceu em 18 de agosto de 2017.",
      ),
    ).toEqual({ nome_completo: "Paciente Teste Caio", data_nascimento: "18/08/2017" });
    expect(
      ler(
        "Vou escolher a Dra. Medica Teste no sábado de manhã, da lista que você apresentou. Meu nome é Paciente Teste Vania, nasci em 3 de fevereiro de 1985.",
      ).nome_completo,
    ).toBe("Paciente Teste Vania");
    expect(
      ler(
        "Vou escolher o Anderson na sexta à tarde. Nome: Paciente Teste Joao Junior. Nascimento: 11/10/1957.",
      ).nome_completo,
    ).toBe("Paciente Teste Joao Junior");
  });

  test("troca de escolha e frases antes do nome", () => {
    expect(
      ler(
        "Pensando melhor, não consigo ir no sábado. Prefiro o Milton na quinta. Meu nome é Paciente Teste Leandro, nasci em 4 de março de 1988.",
      ).nome_completo,
    ).toBe("Paciente Teste Leandro");
    expect(
      ler(
        "Na verdade, quinta com o Milton vai ficar melhor. Nome: Paciente Teste Fabio. Nascimento: 12/09/1985.",
      ).nome_completo,
    ).toBe("Paciente Teste Fabio");
    expect(
      ler("Já informei ali em cima: Paciente Teste Rodrigo, 18/03/1980. Pode seguir."),
    ).toEqual({ nome_completo: "Paciente Teste Rodrigo", data_nascimento: "18/03/1980" });
    expect(ler("Sou o Paciente Teste Ricardo, nasci em 07/08/1974.").nome_completo).toBe(
      "Paciente Teste Ricardo",
    );
  });
});

describe("paciente x responsável", () => {
  test("filho, filha, pai e irmã apresentados por quem escreve", () => {
    expect(
      ler(
        "O paciente é meu filho. Nome dele: Paciente Teste Lucas. Nasceu em 19 de janeiro de 2011.",
      ),
    ).toEqual({ nome_completo: "Paciente Teste Lucas", data_nascimento: "19/01/2011" });
    expect(ler("Minha filha é a paciente. Nome dela: Paciente Teste Sofia.").nome_completo).toBe(
      "Paciente Teste Sofia",
    );
    expect(ler("O paciente é meu pai, Paciente Teste Antonio. Ele nasceu em 20/07/1952.")).toEqual({
      nome_completo: "Paciente Teste Antonio",
      data_nascimento: "20/07/1952",
    });
    expect(
      ler("O nome dele é Paciente Teste Henrique, nasceu em 10 de maio de 2010.").nome_completo,
    ).toBe("Paciente Teste Henrique");
    expect(ler("Minha filha se chama Paciente Teste Luana e nasceu em 11/08/2009.")).toEqual({
      nome_completo: "Paciente Teste Luana",
      data_nascimento: "11/08/2009",
    });
    expect(
      ler("Meu pai se chama Paciente Teste Jose e nasceu em 6 de julho de 1950.").nome_completo,
    ).toBe("Paciente Teste Jose");
    expect(ler("Minha irmã é Paciente Teste Renata, nascida em 25/06/1983.").nome_completo).toBe(
      "Paciente Teste Renata",
    );
  });

  test("mãe se apresenta e informa a filha: o paciente é a filha", () => {
    const r = ler(
      "Meu nome é Responsavel Teste Mariana, sou a mãe. A paciente é minha filha, Paciente Teste Valentina, nascida em 8 de março de 2014.",
    );
    expect(r).toEqual({
      nome_completo: "Paciente Teste Valentina",
      data_nascimento: "08/03/2014",
      responsavel: "Responsavel Teste Mariana",
    });
    const args = argumentosComDados({ motivo: "AGENDAMENTO_TRANSICAO: Cardiologia." }, r);
    expect(args.resumo).toContain("Responsável que fez o contato: Responsavel Teste Mariana");
    expect(args.dados_paciente).toEqual({
      nome_completo: "Paciente Teste Valentina",
      data_nascimento: "08/03/2014",
    });
    expect(
      ler(
        "Eu sou a mãe, Responsavel Teste Juliana. A paciente é minha filha Paciente Teste Beatriz, que nasceu em 9 de abril de 2021.",
      ).nome_completo,
    ).toBe("Paciente Teste Beatriz");
  });
});

describe("sobrenome Nascimento, mês abreviado e formatos", () => {
  test("Nascimento como sobrenome continua no nome", () => {
    expect(ler("Meu nome é Paciente Nascimento Teste. Nasci em 5 de janeiro de 1983.")).toEqual({
      nome_completo: "Paciente Nascimento Teste",
      data_nascimento: "05/01/1983",
    });
    expect(
      ler("Nome completo: Paciente do Nascimento Teste. Data de nascimento: 12/03/1991.")
        .nome_completo,
    ).toBe("Paciente do Nascimento Teste");
    expect(
      ler("Nome: Paciente Teste do Nascimento. Nascimento: 10-03-1984. Quero seguir.")
        .nome_completo,
    ).toBe("Paciente Teste do Nascimento");
  });

  test("data com mês abreviado", () => {
    expect(ler("Meu nome é Paciente Teste Leite. Nasci em 05 jan 1983.").data_nascimento).toBe(
      "05/01/1983",
    );
    expect(ler("nasci em 5 de fev. de 1990").data_nascimento).toBe("05/02/1990");
  });

  test("outros formatos reais", () => {
    expect(ler("PACIENTE TESTE LEONOR, 29/05/1943. Esses são os dados da minha tia.")).toEqual({
      nome_completo: "Paciente Teste Leonor",
      data_nascimento: "29/05/1943",
    });
    expect(
      ler("Paciente: Paciente Teste Gustavo\nNascimento: 16/02/1982\nÉ o meu marido."),
    ).toEqual({
      nome_completo: "Paciente Teste Gustavo",
      data_nascimento: "16/02/1982",
    });
    expect(
      ler("Meu nome é Paciente D'Ávila Teste. Nasci em 17 de maio de 1979.").nome_completo,
    ).toBe("Paciente D'ávila Teste");
    expect(ler("paciente teste da silva 12/03/1980").nome_completo).toBe("Paciente Teste da Silva");
    expect(ler("Minha data de nascimento é 14 de novembro de 1988.")).toEqual({
      nome_completo: null,
      data_nascimento: "14/11/1988",
    });
  });
});

describe("dados já enviados antes na conversa", () => {
  test("nome e data em mensagens diferentes", () => {
    expect(
      dadosDaConversa(
        [
          "Vou escolher o Carlos na quarta de manhã. Pode seguir.",
          "Meu nome é Paciente Teste Rodrigo, nasci em 18/03/1980. É presencial?",
        ],
        HOJE,
      ),
    ).toEqual({ nome_completo: "Paciente Teste Rodrigo", data_nascimento: "18/03/1980" });
    expect(
      dadosDaConversa(["nasci em 20/07/1965", "Meu nome é Paciente Teste Ana."], HOJE),
    ).toEqual({ nome_completo: "Paciente Teste Ana", data_nascimento: "20/07/1965" });
    expect(dadosDaConversa(["ok", "pode seguir"], HOJE)).toEqual({
      nome_completo: null,
      data_nascimento: null,
    });
  });
});
