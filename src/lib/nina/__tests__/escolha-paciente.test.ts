import { describe, expect, test } from "bun:test";
import {
  escolhaNaConversa,
  linhaEscolha,
  profissionaisCitados,
  resumoComEscolha,
  trocaDeAssunto,
} from "../escolha-paciente";

// Nomes fictícios no formato do catálogo (maiúsculas).
const NUTRI = ["MARCELE TESTE FREITAS", "MARIANA TESTE PORTUGAL", "IARA TESTE RODRIGUES"];
const OFTALMO = ["JOAO HELIO TESTE", "MARINA TESTE DIAS"];
const NEURO = ["CARLOS EDUARDO TESTE MONTEIRO", "CARLOS ALBERTO TESTE VARILLAS"];

describe("profissional escolhido (homologação 14/10: motivo trazia o último consultado)", () => {
  test("escolha entre profissionais comparados na pergunta anterior", () => {
    expect(
      escolhaNaConversa(
        [
          "Vou escolher a Mariana na segunda de manhã. Pode seguir com ela.",
          "A Mariana tem segunda de manhã, enquanto a Marcele tem sábado de manhã. Você confirma?",
        ],
        NUTRI,
      ).profissional,
    ).toBe("MARIANA TESTE PORTUGAL");
    expect(
      escolhaNaConversa(
        [
          "Quinta à tarde com o João Hélio fica melhor. Quero seguir com essa consulta.",
          "O João Hélio atende quinta de tarde e a Marina só de manhã nesse dia?",
        ],
        OFTALMO,
      ).profissional,
    ).toBe("JOAO HELIO TESTE");
  });

  test("mais partes do nome decidem; empate não escolhe", () => {
    expect(profissionaisCitados("Quero o Carlos Eduardo na quarta", NEURO)).toEqual([
      "CARLOS EDUARDO TESTE MONTEIRO",
    ]);
    expect(profissionaisCitados("Pode ser com o Carlos", NEURO)).toHaveLength(2);
    expect(escolhaNaConversa(["Pode ser com o Carlos"], NEURO).profissional).toBeNull();
  });

  test("o nome do próprio paciente não é escolha de profissional", () => {
    expect(
      escolhaNaConversa(
        [
          "Meu nome é Marina Paciente Teste, nasci em 21/07/1982.",
          "Quinta à tarde com o João Hélio.",
        ],
        OFTALMO,
      ).profissional,
    ).toBe("JOAO HELIO TESTE");
  });
});

describe("dia, período e pagamento", () => {
  test("troca feita junto com os dados vale sobre a escolha antiga", () => {
    const e = escolhaNaConversa(
      [
        "Na verdade, quinta com o Milton vai ficar melhor. Nome: Paciente Teste. Nascimento: 12/09/1985.",
        "Sábado de manhã com a Raisa parece bom. Pode seguir com ela.",
        "O preço no cartão de crédito é 145 com os dois?",
      ],
      ["MILTON TESTE GUIMARAES", "RAISA TESTE MOURA"],
    );
    expect(e).toEqual({
      profissional: "MILTON TESTE GUIMARAES",
      dia: "quinta-feira",
      periodo: null,
      pagamento: "cartão de crédito",
    });
    expect(linhaEscolha(e)).toBe(
      "Escolha do paciente: Milton Teste Guimaraes · quinta-feira · pagamento: cartão de crédito.",
    );
  });

  test("'essa segunda opção' não é segunda-feira", () => {
    expect(
      escolhaNaConversa(["Vou escolher essa segunda opção na quinta. Pode seguir com ela."], [])
        .dia,
    ).toBe("quinta-feira");
  });

  test("sem escolha nenhuma, sem linha", () => {
    expect(linhaEscolha(escolhaNaConversa(["Quanto custa?"], NUTRI))).toBeNull();
  });
});

describe("resumo com a escolha", () => {
  test("a linha entra depois de nome e data e substitui a anterior", () => {
    const resumo =
      "Nome completo: Paciente Teste\nData de nascimento: 01/01/1990\nEscolha do paciente: Raisa · sábado.\nPaciente deseja agendar.";
    expect(resumoComEscolha(resumo, "Escolha do paciente: Milton · quinta-feira.")).toBe(
      "Nome completo: Paciente Teste\nData de nascimento: 01/01/1990\nEscolha do paciente: Milton · quinta-feira.\nPaciente deseja agendar.",
    );
    expect(resumoComEscolha("Paciente deseja agendar.", null)).toBe("Paciente deseja agendar.");
  });
});

describe("troca de assunto", () => {
  test("desistir do pedido e pedir outro", () => {
    expect(
      trocaDeAssunto(
        "Pensando melhor, vou deixar a dermatologia para depois. Quero começar com nutricionista.",
      ),
    ).toBe(true);
    expect(
      trocaDeAssunto(
        "Vou deixar dermatologia para depois. Quero ver uma consulta com endocrinologista agora.",
      ),
    ).toBe(true);
    expect(trocaDeAssunto("Mudei de ideia, quero cardiologista.")).toBe(true);
  });
  test("troca de dia ou profissional não é troca de assunto", () => {
    expect(
      trocaDeAssunto("Pensando melhor, não consigo ir no sábado. Prefiro o Milton na quinta."),
    ).toBe(false);
    expect(trocaDeAssunto("Na verdade, quinta com o Milton vai ficar melhor.")).toBe(false);
  });
});
