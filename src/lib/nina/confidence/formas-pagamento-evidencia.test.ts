import { describe, expect, it } from "bun:test";
import { extrairEvidencia, formasPagamentoDeclaradas } from "./evidencia-extrator";

const registro = {
  id: "profissional-teste",
  medico: "Carlos Silva",
  procedimento: "Consulta Cardiologia",
  unidade: "Centro",
};
const formas = [{ forma: "Dinheiro" }, { forma: "Cartão" }];

describe("prova explícita das formas de pagamento declaradas", () => {
  it("preserva a lista completa e o registro ao gerar a evidência", () => {
    const ex = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      args: { termo: "cardiologia" },
      dados: {
        base_version: "teste",
        records: [{ ...registro, extras: { formas_pagamento: formas } }],
      },
    });
    expect(ex.fatos.find((f) => f.campo === "formas_pagamento_declaradas")).toMatchObject({
      entidade: "restricao",
      consulta: ex.consulta.id,
      valor: '["cartao","dinheiro"]',
      registro: registro.id,
      versao: "teste",
      chave: {
        procedimento: "consulta cardiologia",
        medicoNome: "Carlos Silva",
        unidadeId: "Centro",
      },
    });
  });

  it.each(
    [undefined, null, [null], [{ forma: "" }], [...formas, { valor: 100 }]].map(
      (formas_pagamento) => ({ formas_pagamento }),
    ),
  )("não fecha uma lista ausente ou malformada: %j", ({ formas_pagamento }) => {
    expect(formasPagamentoDeclaradas({ ...registro, formas_pagamento })).toEqual([]);
  });

  it("preços isolados não provam que a relação de formas está completa", () => {
    expect(
      formasPagamentoDeclaradas({ ...registro, preco_dinheiro: 120, preco_cartao: 145 }),
    ).toEqual([]);
  });

  it("lista publicada explicitamente vazia fecha o conjunto do registro, sem inventar formas", () => {
    expect(formasPagamentoDeclaradas({ ...registro, formas_pagamento: [] })).toEqual([
      { procedimento: "consulta cardiologia", formas: [] },
    ]);
    const ex = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      dados: { records: [{ ...registro, formas_pagamento: [] }] },
    });
    expect(ex.fatos.find((f) => f.campo === "formas_pagamento_declaradas")?.valor).toBe("[]");
    expect(ex.fatos.some((f) => f.campo === "formas_pagamento_indeterminadas")).toBe(false);
  });

  it("não descarta formas desconhecidas para fechar só um subconjunto", () => {
    const r = formasPagamentoDeclaradas({
      ...registro,
      formas_pagamento: [...formas, { forma: "Vale Especial" }],
    });
    expect(r[0]?.formas).toEqual(["cartao", "dinheiro", "vale especial"]);
  });

  it("separa modalidades clínicas explícitas sem misturar cardiologia infantil e geral", () => {
    const r = formasPagamentoDeclaradas({
      ...registro,
      formas_pagamento: [
        { forma: "Dinheiro", condicao: "Consulta Cardiologia" },
        { forma: "Cartão", condicao: "Consulta Cardiologia" },
        { forma: "PIX", condicao: "Consulta Cardiologia Infantil" },
      ],
    });
    expect(r).toEqual([
      { procedimento: "consulta cardiologia", formas: ["cartao", "dinheiro"] },
      { procedimento: "consulta cardiologia infantil", formas: ["pix"] },
    ]);
  });

  it("uma especialidade explicitamente publicada pode delimitar o grupo", () => {
    const r = formasPagamentoDeclaradas({
      ...registro,
      extras: {
        especialidades: ["Cardiologia Infantil"],
        formas_pagamento: [{ forma: "Cartão", condicao: "Cardiologia Infantil" }],
      },
    });
    expect(r).toEqual([{ procedimento: "cardiologia infantil", formas: ["cartao"] }]);
  });

  it.each([
    "3x",
    "à vista",
    "Somente presencial",
    "Consulta Cardiologia apenas dinheiro",
    "Consulta Cardiologia em 3x",
  ])("não generaliza uma condição não compreendida: %s", (condicao) => {
    expect(
      formasPagamentoDeclaradas({
        ...registro,
        formas_pagamento: [...formas, { forma: "PIX", condicao }],
      }),
    ).toEqual([]);
  });

  it("normaliza listas duplicadas equivalentes, mas não escolhe uma lista divergente", () => {
    const r = formasPagamentoDeclaradas({
      ...registro,
      formas_pagamento: formas,
      extras: { formas_pagamento: [...formas].reverse() },
    });
    expect(r).toHaveLength(1);
    expect(
      formasPagamentoDeclaradas({
        ...registro,
        formas_pagamento: formas,
        extras: { formas_pagamento: [{ forma: "PIX" }] },
      }),
    ).toEqual([]);
  });

  it("não ignora uma observação que possa restringir ou ampliar as formas declaradas", () => {
    expect(
      formasPagamentoDeclaradas({
        ...registro,
        formas_pagamento: [{ forma: "Cartão", observacao: "Somente presencial" }],
      }),
    ).toEqual([]);
  });

  it.each(["Dinheiro (PIX não aceito)", "Cartão somente presencial", "Todos exceto PIX"])(
    "não interpreta forma restrita como lista positiva completa: %s",
    (forma) => {
      expect(formasPagamentoDeclaradas({ ...registro, formas_pagamento: [{ forma }] })).toEqual([]);
    },
  );

  it("emite marcador por especialidade quando o registro agregado não declara formas", () => {
    const ex = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      args: { termo: "cardiologia" },
      dados: {
        records: [
          {
            ...registro,
            procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
            extras: { especialidades: ["Cardiologia", "Cardiologia Infantil"] },
          },
        ],
      },
    });
    const marcadores = ex.fatos.filter((f) => f.campo === "formas_pagamento_indeterminadas");
    expect(marcadores).toHaveLength(2);
    expect(marcadores.map((f) => f.chave?.procedimento)).toEqual([
      "Consulta Cardiologia",
      "Consulta Cardiologia Infantil",
    ]);
    expect(
      marcadores.every(
        (f) => f.valor === null && f.consulta === ex.consulta.id && f.registro === registro.id,
      ),
    ).toBe(true);
  });

  it("lista incondicional de um profissional permanece associada a cada especialidade publicada", () => {
    const r = formasPagamentoDeclaradas({
      ...registro,
      procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
      extras: { especialidades: ["Cardiologia", "Cardiologia Infantil"], formas_pagamento: formas },
    });
    expect(r.map((f) => f.procedimento)).toEqual([
      "consulta cardiologia",
      "consulta cardiologia infantil",
    ]);
  });

  it("lista de cardiologia geral não fecha a modalidade infantil do mesmo registro", () => {
    const ex = extrairEvidencia({
      ferramenta: "consultar_base_conhecimento",
      capacidade: "searchKnowledgeBase",
      fonte: "base_conhecimento",
      success: true,
      dados: {
        records: [
          {
            ...registro,
            procedimento: "Consulta — CARDIOLOGIA, CARDIOLOGIA INFANTIL",
            extras: {
              especialidades: ["Cardiologia", "Cardiologia Infantil"],
              formas_pagamento: [{ forma: "Dinheiro", condicao: "Consulta Cardiologia" }],
            },
          },
        ],
      },
    });
    const marcadores = ex.fatos.filter((f) => f.campo === "formas_pagamento_indeterminadas");
    expect(marcadores).toHaveLength(1);
    expect(marcadores[0]?.chave?.procedimento).toBe("Consulta Cardiologia Infantil");
  });
});
