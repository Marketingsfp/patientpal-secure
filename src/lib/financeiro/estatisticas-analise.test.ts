import { describe, expect, it } from "bun:test";
import {
  corteDePareto,
  distribuicaoPorModalidade,
  evolucao,
  rankingPorChave,
} from "./estatisticas-analise";
import type { RateioLinha } from "./rateio-receita";

const linha = (over: Partial<RateioLinha>): RateioLinha =>
  ({
    id: Math.random().toString(36).slice(2),
    data: "2026-09-03",
    origem: "atendimento",
    medico_id: "m1",
    medico_nome: "DRA. ANA",
    paciente_id: null,
    paciente_nome: "",
    especialidade_id: "e1",
    especialidade_nome: "CARDIOLOGIA",
    procedimento: "CONSULTA",
    servico_nome: "CONSULTA",
    condicao: "PARTICULAR",
    tipo_servico: "CONSULTA",
    grupo: null,
    categoria_nome: "PARTICULAR",
    receita: 100,
    repasse: 40,
    terceiro: 0,
    liquido: 60,
    margem: 60,
    formas: [],
    forma_pagamento: "Dinheiro",
    ...over,
  }) as RateioLinha;

describe("rankingPorChave", () => {
  const linhas = [
    linha({ especialidade_nome: "CARDIOLOGIA", receita: 600 }),
    linha({ especialidade_nome: "CARDIOLOGIA", receita: 200 }),
    linha({ especialidade_nome: "PEDIATRIA", receita: 200 }),
  ];

  it("ordena pela receita e fecha 100% de participação", () => {
    const r = rankingPorChave(linhas, "especialidade");
    expect(r.map((l) => l.nome)).toEqual(["CARDIOLOGIA", "PEDIATRIA"]);
    expect(r[0].receita).toBe(800);
    expect(r[0].participacao).toBe(80);
    expect(r[r.length - 1].acumulado).toBe(100);
  });

  it("calcula o ticket de cada linha", () => {
    const r = rankingPorChave(linhas, "especialidade");
    expect(r[0].ticket).toBe(400); // 800 em 2 atendimentos
  });

  it("mensalidade e adesão ficam fora do ranking de médico", () => {
    const comAvulso = [
      ...linhas,
      linha({ origem: "avulso", medico_nome: "Sem profissional", receita: 5000 }),
    ];
    const r = rankingPorChave(comAvulso, "medico");
    expect(r.map((l) => l.nome)).toEqual(["DRA. ANA"]);
  });

  it("mas entram no ranking de serviço, que é o que a clínica vendeu", () => {
    const comAvulso = [
      ...linhas,
      linha({ origem: "avulso", servico_nome: "MENSALIDADE CARTÃO", receita: 5000 }),
    ];
    const r = rankingPorChave(comAvulso, "servico");
    expect(r[0].nome).toBe("MENSALIDADE CARTÃO");
  });

  it("nome vazio vira rótulo legível", () => {
    const r = rankingPorChave([linha({ especialidade_nome: "  " })], "especialidade");
    expect(r[0].nome).toBe("Sem especialidade");
  });
});

describe("corteDePareto", () => {
  it("diz quantas linhas fazem 80% da receita", () => {
    const r = rankingPorChave(
      [
        linha({ especialidade_nome: "A", receita: 800 }),
        linha({ especialidade_nome: "B", receita: 150 }),
        linha({ especialidade_nome: "C", receita: 50 }),
      ],
      "especialidade",
    );
    expect(corteDePareto(r, 80)).toBe(1);
  });

  it("lista vazia não quebra", () => {
    expect(corteDePareto([], 80)).toBe(0);
  });
});

describe("distribuicaoPorModalidade", () => {
  it("separa particular dos produtos do Cartão", () => {
    const r = distribuicaoPorModalidade([
      linha({ condicao: "PARTICULAR" }),
      linha({ condicao: "PARTICULAR" }),
      linha({ condicao: "CARTÃO CONSULTA" }),
      linha({ condicao: "CARTÃO DESCONTO" }),
    ]);
    expect(r.map((f) => f.modalidade)).toEqual([
      "Particular",
      "Cartão Consulta",
      "Cartão Desconto",
    ]);
    expect(r[0].participacao).toBe(50);
  });

  it("a venda do Cartão não conta como atendimento pelo Cartão", () => {
    const r = distribuicaoPorModalidade([
      linha({ condicao: "PARTICULAR" }),
      linha({ origem: "avulso", condicao: "PARTICULAR", servico_nome: "MENSALIDADE" }),
    ]);
    expect(r).toHaveLength(1);
    expect(r[0].atendimentos).toBe(1);
  });
});

describe("evolucao", () => {
  const linhas = [
    linha({ data: "2026-09-01", receita: 100 }),
    linha({ data: "2026-09-01", receita: 300 }),
    linha({ data: "2026-09-03", receita: 200 }),
  ];

  it("agrupa por dia, em ordem, com ticket do dia", () => {
    const r = evolucao(linhas, "dia");
    expect(r.map((p) => p.rotulo)).toEqual(["01/09", "03/09"]);
    expect(r[0].atendimentos).toBe(2);
    expect(r[0].ticket).toBe(200);
  });

  it("agrupa por semana começando no domingo", () => {
    const r = evolucao(linhas, "semana");
    expect(r).toHaveLength(1);
    // 01/09/2026 é uma terça; o domingo dessa semana é 30/08.
    expect(r[0].chave).toBe("2026-08-30");
    expect(r[0].rotulo).toBe("30/08 a 05/09");
    expect(r[0].atendimentos).toBe(3);
    expect(r[0].receita).toBe(600);
    expect(r[0].ticket).toBe(200);
  });
});
