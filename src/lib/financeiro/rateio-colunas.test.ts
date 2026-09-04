import { describe, expect, it } from "bun:test";
import { colunasRateio } from "./rateio-colunas";
import { agruparRateio, compararRateio, type RateioLinha } from "./rateio-receita";

const linha: RateioLinha = {
  id: "1",
  data: "2026-08-25",
  medico_id: "med-1",
  medico_nome: "DRA. ANA",
  especialidade_id: "esp-1",
  especialidade_nome: "CARDIOLOGIA",
  procedimento: "CONSULTA (CARDIOLOGIA)",
  servico_nome: "CONSULTA",
  condicao: "PARTICULAR",
  tipo_servico: "CONSULTA",
  grupo: "Cardiologia",
  categoria_nome: "PARTICULAR",
  receita: 100,
  repasse: 60,
  terceiro: 0,
  liquido: 40,
  margem: 40,
  formas: [{ forma: "dinheiro", valor: 100 }],
};

/**
 * O bug que este arquivo existe para não deixar voltar: a coluna do agrupador
 * apontava para um campo que a linha não tinha, e a tela mostrava "—" no lugar
 * da data (ou do nome) com os valores certos ao lado.
 */
const todasAsChavesExistem = (
  colunas: { chave: string }[],
  objeto: Record<string, unknown>,
): string[] => colunas.map((c) => c.chave).filter((chave) => !(chave in objeto));

describe("colunas do sintetico", () => {
  const agrupamentos = [
    "data",
    "profissional",
    "especialidade",
    "servico",
    "tipo",
    "condicao",
  ] as const;

  for (const agruparPor of agrupamentos) {
    it(`agrupado por ${agruparPor}: toda coluna acha o campo na linha`, () => {
      const grupos = agruparRateio([linha], agruparPor);
      const colunas = colunasRateio("sintetico", agruparPor, false);
      expect(
        todasAsChavesExistem(colunas, grupos[0] as unknown as Record<string, unknown>),
      ).toEqual([]);
    });

    it(`agrupado por ${agruparPor}, comparando: toda coluna acha o campo`, () => {
      const comparados = compararRateio(
        agruparRateio([linha], agruparPor),
        agruparRateio([{ ...linha, id: "2", receita: 80, liquido: 30 }], agruparPor),
        agruparPor,
        0,
      );
      const colunas = colunasRateio("sintetico", agruparPor, true);
      expect(
        todasAsChavesExistem(colunas, comparados[0] as unknown as Record<string, unknown>),
      ).toEqual([]);
    });
  }

  it("a primeira coluna traz a data do grupo, e nao um campo vazio", () => {
    const [grupo] = agruparRateio([linha], "data");
    const [primeira] = colunasRateio("sintetico", "data", false);
    expect(primeira.formato).toBe("data");
    expect((grupo as unknown as Record<string, unknown>)[primeira.chave]).toBe("2026-08-25");
  });

  it("agrupado por profissional a primeira coluna traz o nome do medico", () => {
    const [grupo] = agruparRateio([linha], "profissional");
    const [primeira] = colunasRateio("sintetico", "profissional", false);
    expect(primeira.rotulo).toBe("Profissional");
    expect((grupo as unknown as Record<string, unknown>)[primeira.chave]).toBe("DRA. ANA");
  });

  it("agrupado por profissional traz o fechamento que o financeiro pediu", () => {
    expect(colunasRateio("sintetico", "profissional", false).map((c) => c.rotulo)).toEqual([
      "Profissional",
      "Especialidade",
      "Qtd. atend.",
      "Receita bruta",
      "Repasse prestador",
      "Líquido clínica",
      "% clínica",
    ]);
  });

  /**
   * O que o financeiro pediu: uma linha por serviço, com a mesma consulta
   * somada uma vez só, e não quebrada por especialidade — a agenda grava
   * "CONSULTA (CARDIOLOGIA)" e "CONSULTA (GERIATRIA)" para o mesmo serviço.
   */
  it("agrupado por servico soma o servico do cadastro, sem a especialidade", () => {
    const grupos = agruparRateio(
      [
        linha,
        { ...linha, id: "2", procedimento: "CONSULTA (GERIATRIA)", receita: 50, liquido: 20 },
        {
          ...linha,
          id: "3",
          procedimento: "ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)",
          servico_nome: "ECOCARDIOGRAMA (ADULTO)",
        },
      ],
      "servico",
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["CONSULTA", "ECOCARDIOGRAMA (ADULTO)"]);
    expect(grupos[0]).toMatchObject({ qtd: 2, receita: 150 });
    expect(colunasRateio("sintetico", "servico", false)[0].rotulo).toBe("Serviço");
  });

  /**
   * O caso que motivou o agrupamento por tipo: o financeiro queria dois
   * cadastros do mesmo médico ("JOAO HELIO (CONSULTA)" e "(EXAMES)") só para
   * ver os dois repasses separados. Agrupar por tipo entrega a mesma
   * separação com um cadastro só. Por Grupo de serviço não daria: a consulta e
   * os exames de oftalmologia estão todos no grupo "OFTALMOLOGIA".
   */
  it("agrupado por tipo separa a consulta do exame do mesmo profissional", () => {
    const grupos = agruparRateio(
      [
        linha,
        { ...linha, id: "2", receita: 50, repasse: 30, liquido: 20 },
        {
          ...linha,
          id: "3",
          servico_nome: "MAPEAMENTO DE RETINA",
          tipo_servico: "EXAME",
          receita: 200,
          repasse: 84,
          liquido: 116,
        },
      ],
      "tipo",
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["CONSULTA", "EXAME"]);
    expect(grupos[0]).toMatchObject({ qtd: 2, receita: 150, repasse: 90 });
    expect(grupos[1]).toMatchObject({ qtd: 1, receita: 200, repasse: 84 });
    expect(colunasRateio("sintetico", "tipo", false)[0].rotulo).toBe("Tipo de serviço");
  });

  /** Separa a consulta do Cartão da consulta particular sem serviço duplicado. */
  it("agrupado por condicao separa o cartao do particular", () => {
    const grupos = agruparRateio(
      [linha, { ...linha, id: "2", condicao: "CARTÃO CONSULTA", receita: 9.99, liquido: 0 }],
      "condicao",
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["CARTÃO CONSULTA", "PARTICULAR"]);
    expect(colunasRateio("sintetico", "condicao", false)[0].rotulo).toBe("Condição");
  });

  it("a especialidade so entra no agrupamento por profissional", () => {
    for (const agruparPor of ["data", "especialidade"] as const) {
      const chaves = colunasRateio("sintetico", agruparPor, false).map((c) => c.chave);
      expect(chaves).not.toContain("especialidade_nome");
    }
  });

  it("uma linha por medico, somando o periodo inteiro", () => {
    const grupos = agruparRateio(
      [
        linha,
        { ...linha, id: "2", data: "2026-08-26", receita: 200, repasse: 120, liquido: 80 },
        {
          ...linha,
          id: "3",
          medico_id: "med-2",
          medico_nome: "DR. BRUNO",
          especialidade_id: "esp-2",
          especialidade_nome: "ORTOPEDIA",
        },
      ],
      "profissional",
    );
    expect(grupos.map((g) => g.rotulo)).toEqual(["DR. BRUNO", "DRA. ANA"]);
    const ana = grupos.find((g) => g.rotulo === "DRA. ANA")!;
    expect(ana.qtd).toBe(2);
    expect(ana.receita).toBe(300);
    expect(ana.repasse).toBe(180);
    expect(ana.liquido).toBe(120);
    expect(ana.especialidade_nome).toBe("CARDIOLOGIA");
  });

  it("grupo que mistura especialidades nao escolhe uma delas", () => {
    const [grupo] = agruparRateio(
      [linha, { ...linha, id: "2", especialidade_id: "esp-2", especialidade_nome: "ORTOPEDIA" }],
      "data",
    );
    expect(grupo.especialidade_nome).toBe("Vários");
  });
});

describe("colunas do analitico", () => {
  it("toda coluna acha o campo na linha do atendimento", () => {
    const colunas = colunasRateio("analitico", "data", false);
    expect(todasAsChavesExistem(colunas, linha as unknown as Record<string, unknown>)).toEqual([]);
  });

  /**
   * A coluna sai em toda listagem analítica, e não só quando o agrupamento é
   * por tipo: agrupado por data, é ela que diz de bate-pronto se aquela linha
   * é consulta ou exame, sem obrigar quem confere a reconhecer serviço por
   * serviço. Vale para a tela, o papel, o CSV e o Excel, que leem esta lista.
   */
  it("traz o tipo de servico ao lado do servico", () => {
    const rotulos = colunasRateio("analitico", "data", false).map((c) => c.rotulo);
    expect(rotulos).toContain("Tipo de serviço");
    expect(rotulos.indexOf("Tipo de serviço")).toBe(rotulos.indexOf("Serviço") + 1);
  });

  it("nao ganha as colunas de comparacao, que so existem no sintetico", () => {
    const chaves = colunasRateio("analitico", "data", true).map((c) => c.chave);
    expect(chaves).not.toContain("variacaoValor");
    expect(chaves).not.toContain("receitaAnterior");
  });
});
