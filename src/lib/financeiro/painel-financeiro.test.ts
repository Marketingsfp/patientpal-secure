import { describe, expect, it } from "bun:test";
import type { RateioLinha } from "./rateio-receita";
import {
  categoriaDoAtendimento,
  classificarDespesas,
  grupoDaDespesa,
  producaoDoRateio,
  repassePorMedico,
  resumoPainel,
  somarPorCategoria,
  type LancamentoPainel,
} from "./painel-financeiro";

const linha = (p: Partial<RateioLinha>): RateioLinha => ({
  id: Math.random().toString(36).slice(2),
  data: "2026-09-10",
  origem: "atendimento",
  paciente_id: null,
  paciente_nome: "",
  primeira_vez: null,
  medico_id: "m1",
  medico_nome: "DRA. ISIS",
  especialidade_id: null,
  especialidade_nome: "CLINICA",
  procedimento: "CONSULTA",
  servico_nome: "CONSULTA",
  condicao: "PARTICULAR",
  tipo_servico: "CONSULTA",
  grupo: null,
  categoria_nome: "PARTICULAR",
  receita: 100,
  repasse: 50,
  terceiro: 0,
  liquido: 50,
  margem: 50,
  formas: [{ forma: "dinheiro", valor: p.receita ?? 100 }],
  forma_pagamento: "Dinheiro",
  ...p,
});

const lanc = (p: Partial<LancamentoPainel>): LancamentoPainel => ({
  id: Math.random().toString(36).slice(2),
  data: "2026-09-10",
  descricao: "",
  valor: 0,
  categoria_nome: "OUTROS",
  forma_pagamento: "dinheiro",
  ...p,
});

describe("grupoDaDespesa", () => {
  it("repasse pago pela tela de repasse sai da despesa operacional", () => {
    expect(grupoDaDespesa("REPASSE MEDICO", "REPASSE MEDICO — ISIS (3 ATEND.)")).toBe(
      "repasse_pago",
    );
    expect(grupoDaDespesa("REPASSE TERCEIRO", "ERGOMETRIA")).toBe("repasse_pago");
    expect(grupoDaDespesa("Repasse Médico", "x")).toBe("repasse_pago");
  });

  it("repasse gravado sem categoria é reconhecido pela descrição", () => {
    expect(grupoDaDespesa("(SEM CATEGORIA)", "REPASSE MEDICO — SAMUEL (17 ATEND.)")).toBe(
      "repasse_pago",
    );
    expect(grupoDaDespesa(null, "Repasse Médico — Karen")).toBe("repasse_pago");
  });

  it("complemento médico fica à parte", () => {
    expect(grupoDaDespesa("COMPLEMENTO MEDICO", "ELAIR")).toBe("complemento_medico");
  });

  it("conta da clínica é operacional, inclusive comissionamento", () => {
    for (const cat of ["IPTU", "SALARIOS", "BOLETOS", "COMISSIONAMENTO", "COMPLEMENTO"]) {
      expect(grupoDaDespesa(cat, "QUALQUER")).toBe("operacional");
    }
  });
});

describe("categoriaDoAtendimento", () => {
  it("separa consulta do cartão, consulta particular, exame e o resto", () => {
    expect(categoriaDoAtendimento({ tipo_servico: "CONSULTA", condicao: "CARTÃO CONSULTA" })).toBe(
      "cartao",
    );
    expect(categoriaDoAtendimento({ tipo_servico: "CONSULTA", condicao: "CARTÃO DESCONTO" })).toBe(
      "cartao",
    );
    expect(categoriaDoAtendimento({ tipo_servico: "CONSULTA", condicao: "CONVÊNIO" })).toBe(
      "particular",
    );
    expect(categoriaDoAtendimento({ tipo_servico: "EXAME", condicao: "CARTÃO CONSULTA" })).toBe(
      "exame",
    );
    expect(categoriaDoAtendimento({ tipo_servico: "PROCEDIMENTO", condicao: "PARTICULAR" })).toBe(
      "outro",
    );
    expect(categoriaDoAtendimento({ tipo_servico: "(SEM TIPO)", condicao: "PARTICULAR" })).toBe(
      "outro",
    );
  });

  it("as contagens somam o total do Rateio", () => {
    const p = producaoDoRateio([
      linha({ condicao: "CARTÃO CONSULTA" }),
      linha({}),
      linha({ condicao: "CONVÊNIO" }),
      linha({ tipo_servico: "EXAME" }),
      linha({ tipo_servico: "PROCEDIMENTO" }),
      // Revisão de cortesia: atendida, sem cobrança.
      linha({ receita: 0, repasse: 0 }),
    ]);
    expect(p).toEqual({
      total: 6,
      consultasCartao: 1,
      consultasParticulares: 2,
      consultasConvenio: 1,
      exames: 1,
      outros: 1,
      mensalidades: 0,
      adesoes: 0,
      cortesias: 1,
    });
    expect(
      p.consultasCartao + p.consultasParticulares + p.exames + p.outros + p.cortesias,
    ).toBe(p.total);
  });
});

describe("resumoPainel", () => {
  const rateio = [
    linha({ receita: 200, repasse: 100, terceiro: 0 }),
    linha({ receita: 300, repasse: 120, terceiro: 30, tipo_servico: "EXAME" }),
  ];
  const despesas = classificarDespesas([
    lanc({ categoria_nome: "REPASSE MEDICO", descricao: "REPASSE MEDICO — ISIS", valor: 900 }),
    lanc({ categoria_nome: "IPTU", valor: 40 }),
    lanc({ categoria_nome: "SALARIOS", valor: 60 }),
    lanc({ categoria_nome: "COMPLEMENTO MEDICO", valor: 10 }),
  ]);
  const outras = [lanc({ categoria_nome: "MENSALIDADE CARTAO CONSULTA", valor: 50 })];
  const r = resumoPainel({ rateio, despesas, outrasReceitas: outras });

  it("receita bruta e repasse são os do Rateio; cada pagamento conta 1 atendimento", () => {
    expect(r.receitaBruta).toBe(500);
    expect(r.repasse).toBe(220);
    expect(r.terceiro).toBe(30);
    // 2 atendimentos do Rateio + 1 mensalidade recebida.
    expect(r.producao.total).toBe(3);
    // A mensalidade tem card próprio; "outros" fica só com avulso/procedimento.
    expect(r.producao.mensalidades).toBe(1);
    expect(r.producao.adesoes).toBe(0);
    expect(r.producao.outros).toBe(0);
    expect(
      r.producao.consultasCartao +
        r.producao.consultasParticulares +
        r.producao.exames +
        r.producao.outros +
        r.producao.mensalidades +
        r.producao.adesoes +
        r.producao.cortesias,
    ).toBe(r.producao.total);

    expect(r.liquidoAtendimentos).toBe(250);
    // Ticket médio = (500 + 50) / 3.
    expect(r.ticketMedio).toBe(183.33);
  });


  it("despesa é a do caixa: repasse pago, complemento pago e operacionais", () => {
    expect(r.despesasOperacionais).toBe(100);
    expect(r.complementoMedico).toBe(10);
    expect(r.repassePagoNoPeriodo).toBe(900);
    // O devido continua disponível, lado a lado com o pago.
    expect(r.custoPrestadores).toBe(220 + 30 + 10);
    expect(r.custoPrestadoresPago).toBe(900 + 10);
    expect(r.despesasTotais).toBe(910 + 100);
  });

  it("saldo = receita bruta + outras receitas − despesas do caixa", () => {
    expect(r.outrasReceitas).toBe(50);
    expect(r.saldo).toBe(500 + 50 - 1010);
  });

  it("composição por forma fecha com a receita bruta", () => {
    const soma = r.formas.reduce((s, f) => s + f.valor, 0);
    expect(soma).toBe(r.receitaBruta);
  });

  it("receita total soma as outras receitas, e a quebra por forma fecha com ela", () => {
    const comPix = resumoPainel({
      rateio,
      despesas,
      outrasReceitas: [...outras, lanc({ valor: 80, forma_pagamento: "PIX" })],
    });
    expect(comPix.receitaTotal).toBe(500 + 50 + 80);
    const soma = comPix.formasReceitaTotal.reduce((s, f) => s + f.valor, 0);
    expect(soma).toBe(comPix.receitaTotal);
    expect(comPix.formasReceitaTotal.find((f) => f.forma === "pix")?.valor).toBe(80);
    expect(comPix.formasReceitaTotal.find((f) => f.forma === "dinheiro")?.valor).toBe(550);
    // Cada recebimento também conta como atendimento: (500+50+80) / 4.
    expect(comPix.producao.total).toBe(4);
    expect(comPix.ticketMedio).toBe(157.5);
  });

});

describe("agrupamentos do detalhamento", () => {
  it("soma despesas por categoria, da maior para a menor", () => {
    const g = somarPorCategoria([
      lanc({ categoria_nome: "IPTU", valor: 10 }),
      lanc({ categoria_nome: "SALARIOS", valor: 30 }),
      lanc({ categoria_nome: "IPTU", valor: 25 }),
    ]);
    expect(g).toEqual([
      { rotulo: "IPTU", qtd: 2, valor: 35 },
      { rotulo: "SALARIOS", qtd: 1, valor: 30 },
    ]);
  });

  it("soma repasse por médico e ignora quem não tem repasse", () => {
    const g = repassePorMedico([
      linha({ medico_id: "a", medico_nome: "A", repasse: 10 }),
      linha({ medico_id: "b", medico_nome: "B", repasse: 40, terceiro: 5 }),
      linha({ medico_id: "a", medico_nome: "A", repasse: 15 }),
      linha({ medico_id: null, medico_nome: "Sem profissional", repasse: 0 }),
    ]);
    expect(g.map((x) => [x.medico, x.qtd, x.repasse, x.terceiro])).toEqual([
      ["B", 1, 40, 5],
      ["A", 2, 25, 0],
    ]);
  });
});
