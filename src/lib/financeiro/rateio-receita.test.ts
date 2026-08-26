import { describe, expect, it } from "bun:test";
import {
  agruparRateio,
  chaveGrupo,
  compararRateio,
  filtrarRateio,
  margemClinica,
  totaisRateio,
  type RateioContexto,
  type RateioGrupo,
  type RateioLinha,
} from "./rateio-receita";

const linha = (over: Partial<RateioLinha>): RateioLinha => ({
  id: over.id ?? "x",
  data: "2026-08-03",
  medico_id: "med-1",
  medico_nome: "DRA. ANA",
  especialidade_id: "esp-1",
  especialidade_nome: "CARDIOLOGIA",
  procedimento: "CONSULTA",
  grupo: "Cardiologia",
  receita: 100,
  repasse: 60,
  terceiro: 0,
  liquido: 40,
  margem: 40,
  ...over,
});

describe("agruparRateio", () => {
  it("soma quantidade, receita, repasse e liquido por dia", () => {
    const g = agruparRateio(
      [
        linha({ id: "1", data: "2026-08-03", receita: 100, repasse: 60, liquido: 40 }),
        linha({ id: "2", data: "2026-08-03", receita: 50, repasse: 20, liquido: 30 }),
        linha({ id: "3", data: "2026-08-04", receita: 200, repasse: 80, liquido: 120 }),
      ],
      "data",
    );
    expect(g.map((x) => x.rotulo)).toEqual(["2026-08-03", "2026-08-04"]);
    expect(g[0]).toMatchObject({ qtd: 2, receita: 150, repasse: 80, liquido: 70 });
    expect(g[1]).toMatchObject({ qtd: 1, receita: 200, repasse: 80, liquido: 120 });
  });

  it("agrupa por profissional e por especialidade usando o rotulo certo", () => {
    const linhas = [
      linha({ id: "1", medico_id: "med-1", medico_nome: "DRA. ANA" }),
      linha({
        id: "2",
        medico_id: "med-2",
        medico_nome: "DR. BRUNO",
        especialidade_id: "esp-2",
        especialidade_nome: "ORTOPEDIA",
      }),
    ];
    expect(agruparRateio(linhas, "profissional").map((g) => g.rotulo)).toEqual([
      "DR. BRUNO",
      "DRA. ANA",
    ]);
    expect(agruparRateio(linhas, "especialidade").map((g) => g.rotulo)).toEqual([
      "CARDIOLOGIA",
      "ORTOPEDIA",
    ]);
  });

  it("junta numa unica linha quem nao tem profissional", () => {
    const g = agruparRateio(
      [
        linha({ id: "1", medico_id: null, medico_nome: "Sem profissional" }),
        linha({ id: "2", medico_id: null, medico_nome: "Sem profissional" }),
      ],
      "profissional",
    );
    expect(g).toHaveLength(1);
    expect(g[0].qtd).toBe(2);
  });

  it("calcula a margem da clinica sobre a receita do grupo", () => {
    const g = agruparRateio(
      [linha({ id: "1", receita: 250, repasse: 100, liquido: 150 })],
      "profissional",
    );
    expect(g[0].margem).toBe(60);
  });
});

describe("margemClinica", () => {
  it("nao divide por zero quando o periodo nao teve receita", () => {
    expect(margemClinica(0, 0)).toBe(0);
  });

  it("fica negativa quando o repasse passou da receita", () => {
    expect(margemClinica(100, -20)).toBe(-20);
  });
});

describe("totaisRateio", () => {
  it("consolida o periodo inteiro, inclusive a parte do terceiro ja descontada", () => {
    const t = totaisRateio([
      linha({ id: "1", receita: 100, repasse: 40, terceiro: 30, liquido: 30 }),
      linha({ id: "2", receita: 100, repasse: 50, terceiro: 0, liquido: 50 }),
    ]);
    expect(t).toEqual({ qtd: 2, receita: 200, repasse: 90, liquido: 80, margem: 40 });
  });
});

describe("chaveGrupo", () => {
  it("trata o mesmo grupo escrito de formas diferentes como um so", () => {
    expect(chaveGrupo("Oftalmologia")).toBe(chaveGrupo("OFTALMOLOGIA"));
    expect(chaveGrupo("Laboratório")).toBe(chaveGrupo("LABORATORIO"));
  });

  it("devolve nulo para grupo vazio", () => {
    expect(chaveGrupo(null)).toBeNull();
    expect(chaveGrupo("   ")).toBeNull();
  });
});

describe("filtrarRateio", () => {
  const ctx = {
    grupoPorServico: new Map([
      ["consulta", chaveGrupo("Cardiologia")!],
      ["raio-x torax", chaveGrupo("RAIO-X")!],
    ]),
  } as unknown as RateioContexto;
  const base = { clinicaId: "c1", de: "2026-08-01", ate: "2026-08-31" };
  const linhas = [
    linha({ id: "1", procedimento: "CONSULTA" }),
    linha({ id: "2", procedimento: "RAIO-X TORAX", medico_id: "med-2", medico_nome: "DR. BRUNO" }),
    linha({ id: "3", procedimento: null }),
  ];

  it("filtra por grupo de servico ignorando caixa e acento", () => {
    const r = filtrarRateio(ctx, linhas, { ...base, grupo: chaveGrupo("raio-x") });
    expect(r.map((l) => l.id)).toEqual(["2"]);
  });

  it("filtra por servico exato", () => {
    const r = filtrarRateio(ctx, linhas, { ...base, servico: "consulta" });
    expect(r.map((l) => l.id)).toEqual(["1"]);
  });

  it("filtra por profissional", () => {
    const r = filtrarRateio(ctx, linhas, { ...base, medicoId: "med-2" });
    expect(r.map((l) => l.id)).toEqual(["2"]);
  });

  it("nao mexe nas linhas quando nenhum filtro foi escolhido", () => {
    expect(filtrarRateio(ctx, linhas, base)).toHaveLength(3);
  });
});

describe("compararRateio", () => {
  const grupo = (over: Partial<RateioGrupo>): RateioGrupo => ({
    chave: "med-1",
    rotulo: "DRA. ANA",
    qtd: 1,
    receita: 100,
    repasse: 60,
    liquido: 40,
    margem: 40,
    ...over,
  });

  it("casa o mesmo profissional nos dois periodos e mostra quanto subiu", () => {
    const r = compararRateio(
      [grupo({ receita: 150 })],
      [grupo({ receita: 100 })],
      "profissional",
      0,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({
      receita: 150,
      receitaAnterior: 100,
      variacaoValor: 50,
      variacaoPercentual: 50,
      somenteAnterior: false,
    });
  });

  it("por data compara o dia com o dia de mesma posicao no outro periodo", () => {
    const atuais = [
      grupo({ chave: "2026-08-20", rotulo: "2026-08-20", receita: 300 }),
      grupo({ chave: "2026-08-21", rotulo: "2026-08-21", receita: 200 }),
    ];
    // Periodo de comparacao comeca 7 dias antes.
    const anteriores = [
      grupo({ chave: "2026-08-13", rotulo: "2026-08-13", receita: 100 }),
      grupo({ chave: "2026-08-14", rotulo: "2026-08-14", receita: 400 }),
    ];
    const r = compararRateio(atuais, anteriores, "data", 7);
    expect(r.map((g) => [g.rotulo, g.receitaAnterior])).toEqual([
      ["2026-08-20", 100],
      ["2026-08-21", 400],
    ]);
  });

  it("quem faturava e sumiu aparece com queda de 100%", () => {
    const r = compararRateio(
      [grupo({ chave: "med-1", rotulo: "DRA. ANA", receita: 100 })],
      [
        grupo({ chave: "med-1", rotulo: "DRA. ANA", receita: 100 }),
        grupo({ chave: "med-2", rotulo: "DR. BRUNO", receita: 80 }),
      ],
      "profissional",
      0,
    );
    const sumiu = r.find((g) => g.rotulo === "DR. BRUNO")!;
    expect(sumiu).toMatchObject({
      qtd: 0,
      receita: 0,
      receitaAnterior: 80,
      variacaoValor: -80,
      variacaoPercentual: -100,
      somenteAnterior: true,
    });
  });

  it("quem nao existia antes fica sem percentual, em vez de 0%", () => {
    const r = compararRateio([grupo({ receita: 90 })], [], "profissional", 0);
    expect(r[0].variacaoPercentual).toBeNull();
    expect(r[0].variacaoValor).toBe(90);
  });
});
