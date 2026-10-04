import { describe, expect, test } from "bun:test";
import { aplicarEdicaoCatalogoIA } from "../catalogo-edicao-ia";
import { servicoSchema, profissionalSchema } from "../catalogo";

const vinculo = "11111111-1111-4111-8111-111111111111";
const servico = servicoSchema.parse({
  nome: "Mamografia",
  procedimento_id: vinculo,
  valor: 160,
  descricao_publica: "Mamografia bilateral",
  preparo: "Trazer exames anteriores.",
  restricoes: "Pedido médico.",
  nota_interna: "Conferir autorização",
  valor_observacao: "Valores particulares",
  executantes: [
    { medico_id: vinculo, nome: "Dra. Ana", horarios: "Quintas", observacao: "Equipamento 2" },
  ],
  formas_pagamento: [
    { forma: "Dinheiro", valor: 160, condicao: "À vista", observacao: null },
    { forma: "Cartão", valor: 200, condicao: "Em 2x", observacao: "Crédito" },
  ],
});
const profissional = profissionalSchema.parse({
  nome: "Dra. Ana",
  medico_id: vinculo,
  unidade_id: vinculo,
  especialidades: [{ id: vinculo, nome: "Cardiologia" }],
  convenios: [
    { id: vinculo, nome: "Convênio A" },
    { id: null, nome: "Convênio sem vínculo" },
  ],
  atende_consultorio: true,
  tipo_atendimento: "Hora marcada",
  horarios: [
    {
      dia: "Quinta-feira",
      inicio: "14:00",
      fim: "18:00",
      recorrencia: "Quinzenal",
      observacao: "Sala 2",
    },
    {
      dia: "Sexta-feira",
      inicio: "08:00",
      fim: null,
      recorrencia: "Toda semana",
      observacao: null,
    },
  ],
});
const definir = (caminho: string, valor: unknown) => ({
  operacao: "definir",
  caminho,
  valor_json: JSON.stringify(valor),
});
const proposta = (...alteracoes: any[]) => ({ alteracoes, pendencias: [], ambiguidades: [] });

describe("Edição assistida do catálogo", () => {
  test("mamografia: altera só dinheiro, preserva cartão, preparo, restrições e vínculos", () => {
    const original = structuredClone(servico);
    const r = aplicarEdicaoCatalogoIA(
      "servico",
      servico,
      proposta(definir("/formas_pagamento/0/valor", 180)),
    );
    expect(r.dados).toEqual({
      ...servico,
      valor: 180,
      formas_pagamento: [
        { ...servico.formas_pagamento[0], valor: 180 },
        servico.formas_pagamento[1],
      ],
    });
    expect(servico).toEqual(original);
    expect(r.mudancas.map((m) => m.campo)).toEqual(["Valor", "Formas de pagamento"]);
    expect(r.mudancas[1]!.depois).toContain("200,00");
  });
  test("horário de consulta preserva recorrência, outros dias, convênios e médico", () => {
    const r = aplicarEdicaoCatalogoIA(
      "profissional",
      profissional,
      proposta(definir("/horarios/0/inicio", "14:30")),
    );
    expect(r.dados).toEqual({
      ...profissional,
      horarios: [{ ...profissional.horarios[0], inicio: "14:30" }, profissional.horarios[1]],
    });
    expect(r.mudancas).toHaveLength(1);
  });
  test("prévia compara com publicado e inclui também as alterações do rascunho", () => {
    const registro = { ...servico, rascunho: { preparo: "Trazer exames e documento." } };
    const r = aplicarEdicaoCatalogoIA(
      "servico",
      registro,
      proposta(definir("/formas_pagamento/0/valor", 180)),
    );
    expect(r.mudancas.find((m) => m.campo === "Preparo")).toEqual({
      campo: "Preparo",
      antes: "Trazer exames anteriores.",
      depois: registro.rascunho.preparo,
    });
    expect(r.dados.preparo).toBe(registro.rascunho.preparo);
  });
  test("limpeza explícita remove só o campo solicitado", () => {
    const r = aplicarEdicaoCatalogoIA("servico", servico, proposta(definir("/nota_interna", null)));
    expect(r.dados).toEqual({ ...servico, nota_interna: null });
  });
  test("rascunho com troca de vínculo exige revisão manual, sem publicar alteração invisível", () => {
    expect(() =>
      aplicarEdicaoCatalogoIA(
        "servico",
        { ...servico, rascunho: { procedimento_id: null } },
        proposta(definir("/preparo", "Novo preparo informado pelo operador.")),
      ),
    ).toThrow("vínculos em revisão");
  });
  test("remover todos os preços não mantém um resumo antigo como se fosse oferta", () => {
    const r = aplicarEdicaoCatalogoIA(
      "servico",
      servico,
      proposta(
        definir("/formas_pagamento/0/valor", null),
        definir("/formas_pagamento/1/valor", null),
      ),
    );
    expect(r.dados.valor).toBeNull();
    expect(r.mudancas.find((m) => m.campo === "Valor")?.depois).toBe("Não informado");
  });
  test("adicionar PIX e remover dinheiro preserva cartão e calcula preço do resumo", () => {
    const r = aplicarEdicaoCatalogoIA(
      "servico",
      servico,
      proposta(
        {
          operacao: "adicionar",
          caminho: "/formas_pagamento",
          valor_json: JSON.stringify({ forma: "PIX", valor: 170 }),
        },
        { operacao: "remover", caminho: "/formas_pagamento/0", valor_json: null },
      ),
    );
    expect(r.dados.formas_pagamento).toEqual([
      servico.formas_pagamento[1],
      { forma: "PIX", valor: 170, condicao: null, observacao: null },
    ]);
    expect(r.dados.valor).toBe(170);
  });
  test.each([
    "/id",
    "/clinica_id",
    "/procedimento_id",
    "/status",
    "/created_at",
    "/rascunho",
    "/__proto__/poluido",
  ])("rejeita alteração de %s", (caminho) => {
    expect(() =>
      aplicarEdicaoCatalogoIA("servico", servico, proposta(definir(caminho, vinculo))),
    ).toThrow();
  });
  test("não substitui a lista inteira nem altera vínculo dentro de executante", () => {
    for (const op of [
      definir("/formas_pagamento", []),
      definir("/executantes/0/medico_id", null),
      definir("/executantes/0/nome", "Outro médico"),
    ])
      expect(() => aplicarEdicaoCatalogoIA("servico", servico, proposta(op))).toThrow();
  });
  test.each([-1, "180", "a combinar", {}, true])(
    "rejeita preço inválido %p sem apagá-lo",
    (valor) => {
      expect(() =>
        aplicarEdicaoCatalogoIA(
          "servico",
          servico,
          proposta(definir("/formas_pagamento/0/valor", valor)),
        ),
      ).toThrow();
    },
  );
  test("preço genérico não pode contradizer as formas de pagamento", () => {
    expect(() =>
      aplicarEdicaoCatalogoIA("servico", servico, proposta(definir("/valor", 180))),
    ).toThrow("forma de pagamento");
  });
  test.each(["25:00", "14h30", "19:00"])(
    "rejeita hora inválida ou posterior ao fim: %s",
    (hora) => {
      expect(() =>
        aplicarEdicaoCatalogoIA(
          "profissional",
          profissional,
          proposta(definir("/horarios/0/inicio", hora)),
        ),
      ).toThrow();
    },
  );
  test("pendência, ambiguidade e pedido sem mudança não produzem prévia publicável", () => {
    expect(() =>
      aplicarEdicaoCatalogoIA("servico", servico, {
        ...proposta(),
        ambiguidades: ["Qual forma de pagamento?"],
      }),
    ).toThrow("Qual forma de pagamento");
    expect(() =>
      aplicarEdicaoCatalogoIA("servico", servico, {
        ...proposta(),
        pendencias: ["Troca de vínculo é manual."],
      }),
    ).toThrow("manual");
    expect(() =>
      aplicarEdicaoCatalogoIA("servico", servico, proposta(definir("/nome", "Mamografia"))),
    ).toThrow("não gerou alterações");
  });
});
