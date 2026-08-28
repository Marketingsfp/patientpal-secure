import { describe, expect, it } from "bun:test";
import {
  classificarReceita,
  tipoDoProcedimento,
  totaisPorForma,
  totaisPorGrupo,
  barraDeFormas,
  resumoSintetico,
  baldeCasaComColuna,
  GRUPOS_RECEITA,
  type GrupoReceita,
} from "./composicao-receita";

const TIPOS = new Map<string, string>([
  ["CONSULTA", "consulta"],
  ["CONSULTA OFTALMO", "consulta"],
  ["ELETROCARDIOGRAMA (ECG)", "exame"],
  ["ECOCARDIOGRAMA (ADULTO)", "exame"],
  ["EXAMES LABORATORIAIS", "exame"],
  ["INFILTRACAO DR PAULO ROBERTO (CADA)", "procedimento"],
  ["CURATIVO", "outro"],
]);

const AGOSTO = { de: "2026-08-01", ate: "2026-08-31" };

describe("tipoDoProcedimento", () => {
  it("acha pelo nome inteiro", () => {
    expect(tipoDoProcedimento("CONSULTA", TIPOS)).toBe("consulta");
  });

  it("acha tirando a especialidade colada no fim", () => {
    // agendamentos.procedimento guarda "CONSULTA (CARDIOLOGIA)"; o cadastro
    // guarda só "CONSULTA".
    expect(tipoDoProcedimento("CONSULTA (CARDIOLOGIA)", TIPOS)).toBe("consulta");
    expect(tipoDoProcedimento("EXAMES LABORATORIAIS (LABORATORIO)", TIPOS)).toBe("exame");
  });

  it("não estraga nome que legitimamente termina em parênteses", () => {
    // O nome inteiro casa primeiro; se tirasse o parêntese viraria
    // "ELETROCARDIOGRAMA", que não existe no cadastro.
    expect(tipoDoProcedimento("ELETROCARDIOGRAMA (ECG)", TIPOS)).toBe("exame");
  });

  it("tira só o último parêntese quando há dois", () => {
    expect(tipoDoProcedimento("ECOCARDIOGRAMA (ADULTO) (CARDIOLOGIA)", TIPOS)).toBe("exame");
    expect(tipoDoProcedimento("INFILTRACAO DR PAULO ROBERTO (CADA) (ORTOPEDIA)", TIPOS)).toBe(
      "procedimento",
    );
  });

  it("é indiferente a caixa e espaços", () => {
    expect(tipoDoProcedimento("  consulta (pediatria)  ", TIPOS)).toBe("consulta");
  });

  it("devolve null para vazio ou desconhecido", () => {
    expect(tipoDoProcedimento(null, TIPOS)).toBeNull();
    expect(tipoDoProcedimento("", TIPOS)).toBeNull();
    expect(tipoDoProcedimento("PROCEDIMENTO QUE NAO EXISTE", TIPOS)).toBeNull();
  });
});

describe("classificarReceita", () => {
  it("consulta e exame/procedimento pelo cadastro", () => {
    expect(
      classificarReceita({ tipo: "receita", procedimento: "CONSULTA (ORTOPEDIA)" }, AGOSTO, TIPOS),
    ).toBe("consulta");
    expect(
      classificarReceita({ tipo: "receita", procedimento: "USG (IMAGEM)" }, AGOSTO, TIPOS),
    ).toBe("outros");
    expect(
      classificarReceita(
        { tipo: "receita", procedimento: "INFILTRACAO DR PAULO ROBERTO (CADA) (ORTOPEDIA)" },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("exame_procedimento");
  });

  it("procedimento de tipo 'outro' não vira exame", () => {
    expect(classificarReceita({ tipo: "receita", procedimento: "CURATIVO" }, AGOSTO, TIPOS)).toBe(
      "outros",
    );
  });

  it("mensalidade do mês, atrasada e antecipada", () => {
    const base = { tipo: "receita", mensalidadeParcela: 3 };
    expect(
      classificarReceita({ ...base, mensalidadeVencimento: "2026-08-10" }, AGOSTO, TIPOS),
    ).toBe("mensalidade_periodo");
    expect(
      classificarReceita({ ...base, mensalidadeVencimento: "2026-07-10" }, AGOSTO, TIPOS),
    ).toBe("mensalidade_atrasada");
    expect(
      classificarReceita({ ...base, mensalidadeVencimento: "2026-09-10" }, AGOSTO, TIPOS),
    ).toBe("mensalidade_antecipada");
  });

  it("vencimento nas bordas do período conta como do período", () => {
    const base = { tipo: "receita", mensalidadeParcela: 1 };
    expect(
      classificarReceita({ ...base, mensalidadeVencimento: "2026-08-01" }, AGOSTO, TIPOS),
    ).toBe("mensalidade_periodo");
    expect(
      classificarReceita({ ...base, mensalidadeVencimento: "2026-08-31" }, AGOSTO, TIPOS),
    ).toBe("mensalidade_periodo");
  });

  it("taxa de adesão (parcela 0) não é mensalidade — tem grupo próprio", () => {
    // Até 27/08/2026 caía em "outros"; a diretoria pediu o valor separado, e
    // agora ele tem card próprio dentro do bloco de mensalidades.
    expect(
      classificarReceita(
        { tipo: "receita", mensalidadeVencimento: "2026-08-10", mensalidadeParcela: 0 },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("adesao");
  });

  it("mensalidade vence o procedimento quando os dois existem", () => {
    expect(
      classificarReceita(
        {
          tipo: "receita",
          procedimento: "CONSULTA",
          mensalidadeVencimento: "2026-07-10",
          mensalidadeParcela: 2,
        },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("mensalidade_atrasada");
  });

  it("despesa e transferência não entram na composição da receita", () => {
    expect(classificarReceita({ tipo: "despesa", procedimento: "CONSULTA" }, AGOSTO, TIPOS)).toBe(
      "outros",
    );
    expect(classificarReceita({ tipo: "transferencia" }, AGOSTO, TIPOS)).toBe("outros");
  });
});

describe("totaisPorGrupo", () => {
  it("soma por grupo e devolve todos os grupos, mesmo zerados", () => {
    const t = totaisPorGrupo([
      { grupo: "consulta", valor: 130 },
      { grupo: "consulta", valor: "70.50" },
      { grupo: "mensalidade_atrasada", valor: 200 },
    ]);
    expect(t.consulta).toEqual({ qtd: 2, total: 200.5 });
    expect(t.mensalidade_atrasada).toEqual({ qtd: 1, total: 200 });
    expect(t.exame_procedimento).toEqual({ qtd: 0, total: 0 });
    expect(Object.keys(t).sort()).toEqual([...GRUPOS_RECEITA].sort());
  });

  it("a soma dos grupos fecha com o total das linhas", () => {
    const linhas: Array<{ grupo: GrupoReceita; valor: number }> = [
      { grupo: "consulta", valor: 110 },
      { grupo: "exame_procedimento", valor: 250.55 },
      { grupo: "mensalidade_periodo", valor: 165 },
      { grupo: "outros", valor: 9.45 },
    ];
    const t = totaisPorGrupo(linhas);
    const somaGrupos = GRUPOS_RECEITA.reduce((s, g) => s + t[g].total, 0);
    const somaLinhas = linhas.reduce((s, l) => s + l.valor, 0);
    expect(Number(somaGrupos.toFixed(2))).toBe(Number(somaLinhas.toFixed(2)));
  });
});

describe("totaisPorForma", () => {
  it("agrupa por forma, com quantidade, na ordem do financeiro", () => {
    const r = totaisPorForma([
      { balde: "credito", valor: 100 },
      { balde: "dinheiro", valor: 50 },
      { balde: "dinheiro", valor: 25.5 },
      { balde: "pix", valor: 10 },
    ]);
    expect(r.formas.map((f) => f.forma)).toEqual(["dinheiro", "pix", "credito"]);
    expect(r.formas[0]).toEqual({
      forma: "dinheiro",
      label: "Dinheiro",
      qtd: 2,
      total: 75.5,
    });
    expect(r.qtd).toBe(4);
    expect(r.total).toBe(185.5);
  });

  it("não inventa linha para forma sem transação", () => {
    const r = totaisPorForma([{ balde: "pix", valor: 10 }]);
    expect(r.formas).toHaveLength(1);
  });

  it("lista vazia devolve zeros", () => {
    expect(totaisPorForma([])).toEqual({ formas: [], qtd: 0, total: 0 });
  });
});

describe("barraDeFormas", () => {
  it("devolve sempre as três colunas, na ordem Dinheiro, PIX, Cartão", () => {
    const b = barraDeFormas([]);
    expect(b.map((c) => c.chave)).toEqual(["dinheiro", "pix", "cartao"]);
    expect(b.every((c) => c.total === 0 && c.qtd === 0)).toBe(true);
  });

  it("soma débito, crédito e cartão legado numa coluna só", () => {
    const b = barraDeFormas([
      { forma: "debito", label: "Cartão de Débito", qtd: 2, total: 100 },
      { forma: "credito", label: "Cartão de Crédito", qtd: 3, total: 250.5 },
      { forma: "legado_cartao", label: "Parcelas do sistema antigo", qtd: 1, total: 49.5 },
      { forma: "dinheiro", label: "Dinheiro", qtd: 4, total: 80 },
    ]);
    const cartao = b.find((c) => c.chave === "cartao")!;
    expect(cartao.qtd).toBe(6);
    expect(cartao.total).toBe(400);
    expect(b.find((c) => c.chave === "dinheiro")!.total).toBe(80);
    expect(b.find((c) => c.chave === "pix")!.total).toBe(0);
  });

  it("cada coluna aponta para a opção certa do filtro de forma", () => {
    expect(barraDeFormas([]).map((c) => c.filtro)).toEqual(["dinheiro", "pix", "cartao"]);
  });

  it("convênio e transferência não entram em nenhuma das três colunas", () => {
    const b = barraDeFormas([
      { forma: "convenio", label: "Convênio / Gratuidade", qtd: 5, total: 500 },
      { forma: "transferencia", label: "Transferência / Depósito", qtd: 1, total: 90 },
    ]);
    expect(b.reduce((s, c) => s + c.total, 0)).toBe(0);
  });
});

describe("resumoSintetico", () => {
  it("agrupa por categoria com entradas, saídas e saldo", () => {
    const r = resumoSintetico([
      { categoria: "PARTICULAR", tipo: "receita", valor: 130 },
      { categoria: "PARTICULAR", tipo: "receita", valor: "70.50" },
      { categoria: "SALARIOS", tipo: "despesa", valor: 500 },
    ]);
    expect(r.linhas[0]).toEqual({
      label: "SALARIOS",
      qtd: 1,
      entradas: 0,
      saidas: 500,
      saldo: -500,
    });
    expect(r.linhas[1]).toEqual({
      label: "PARTICULAR",
      qtd: 2,
      entradas: 200.5,
      saidas: 0,
      saldo: 200.5,
    });
    expect(r.total).toEqual({ qtd: 3, entradas: 200.5, saidas: 500, saldo: -299.5 });
  });

  it("transferência entra pelo sentido: suprimento soma, sangria subtrai", () => {
    const r = resumoSintetico([
      { categoria: "Transferências", tipo: "transferencia", sentido: "entrada", valor: 300 },
      { categoria: "Transferências", tipo: "transferencia", sentido: "saida", valor: 100 },
    ]);
    expect(r.linhas[0]).toEqual({
      label: "Transferências",
      qtd: 2,
      entradas: 300,
      saidas: 100,
      saldo: 200,
    });
  });

  it("linha sem categoria recebe rótulo próprio em vez de sumir", () => {
    const r = resumoSintetico([{ categoria: "", tipo: "receita", valor: 10 }]);
    expect(r.linhas[0].label).toBe("(sem categoria)");
  });

  it("o total sintético fecha com a soma das linhas", () => {
    const r = resumoSintetico([
      { categoria: "A", tipo: "receita", valor: 10.1 },
      { categoria: "B", tipo: "receita", valor: 20.2 },
      { categoria: "C", tipo: "despesa", valor: 5.05 },
    ]);
    const somaEnt = r.linhas.reduce((s, l) => s + l.entradas, 0);
    const somaSai = r.linhas.reduce((s, l) => s + l.saidas, 0);
    expect(Number(somaEnt.toFixed(2))).toBe(r.total.entradas);
    expect(Number(somaSai.toFixed(2))).toBe(r.total.saidas);
    expect(r.total.saldo).toBe(25.25);
  });

  it("lista vazia devolve zeros", () => {
    expect(resumoSintetico([])).toEqual({
      linhas: [],
      total: { qtd: 0, entradas: 0, saidas: 0, saldo: 0 },
    });
  });
});

describe("classificarReceita — adesão do Cartão Benefícios", () => {
  it("mensalidade vinculada com parcela 0 é adesão, não mensalidade", () => {
    expect(
      classificarReceita(
        { tipo: "receita", mensalidadeVencimento: "2026-08-10", mensalidadeParcela: 0 },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("adesao");
  });

  it("parcela negativa (dependente) também é adesão", () => {
    expect(
      classificarReceita(
        { tipo: "receita", mensalidadeVencimento: "2026-08-10", mensalidadeParcela: -1 },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("adesao");
  });

  it("adesão solta, sem vínculo, é reconhecida pela categoria", () => {
    // Em agosto/2026 são 11 lançamentos assim: categoria de adesão e nenhuma
    // linha em contrato_mensalidades apontando para eles.
    expect(
      classificarReceita(
        { tipo: "receita", categoria: "DEPENDENTE / ADESAO CARTAO" },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("adesao");
    expect(
      classificarReceita({ tipo: "receita", categoria: "TAXA DE ADESAO CARTAO" }, AGOSTO, TIPOS),
    ).toBe("adesao");
  });

  it("categoria com acento também conta", () => {
    expect(
      classificarReceita({ tipo: "receita", categoria: "Taxa de Adesão" }, AGOSTO, TIPOS),
    ).toBe("adesao");
  });

  it("mensalidade recorrente continua sendo mensalidade", () => {
    expect(
      classificarReceita(
        {
          tipo: "receita",
          categoria: "MENSALIDADE CARTAO CONSULTA",
          mensalidadeVencimento: "2026-08-10",
          mensalidadeParcela: 2,
        },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("mensalidade_periodo");
  });

  it("adesão vence o procedimento quando os dois existem", () => {
    expect(
      classificarReceita(
        { tipo: "receita", categoria: "TAXA DE ADESAO CARTAO", procedimento: "CONSULTA" },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("adesao");
  });

  it("categoria comum não vira adesão por acidente", () => {
    expect(
      classificarReceita(
        { tipo: "receita", categoria: "PARTICULAR", procedimento: "CONSULTA" },
        AGOSTO,
        TIPOS,
      ),
    ).toBe("consulta");
  });

  it("adesão entra na lista de grupos e no fechamento", () => {
    const t = totaisPorGrupo([
      { grupo: "adesao", valor: 30 },
      { grupo: "mensalidade_periodo", valor: 150 },
    ]);
    expect(t.adesao).toEqual({ qtd: 1, total: 30 });
    expect(GRUPOS_RECEITA).toContain("adesao");
  });
});

describe("baldeCasaComColuna", () => {
  it("cartão junta débito, crédito e as parcelas antigas", () => {
    expect(baldeCasaComColuna("debito", "cartao")).toBe(true);
    expect(baldeCasaComColuna("credito", "cartao")).toBe(true);
    expect(baldeCasaComColuna("legado_cartao", "cartao")).toBe(true);
  });

  it("dinheiro e PIX só casam com a própria coluna", () => {
    expect(baldeCasaComColuna("dinheiro", "dinheiro")).toBe(true);
    expect(baldeCasaComColuna("dinheiro", "pix")).toBe(false);
    expect(baldeCasaComColuna("pix", "pix")).toBe(true);
    expect(baldeCasaComColuna("pix", "cartao")).toBe(false);
  });

  it("o que não é somado na coluna também não é filtrado por ela", () => {
    // Convênio e transferência ficam fora das três colunas na soma; o filtro
    // precisa concordar, senão clicar num card mostraria linha que não entrou
    // naquele total.
    for (const chave of ["dinheiro", "pix", "cartao"] as const) {
      expect(baldeCasaComColuna("convenio", chave)).toBe(false);
      expect(baldeCasaComColuna("transferencia", chave)).toBe(false);
    }
  });
});
