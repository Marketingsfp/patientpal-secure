import { describe, expect, it } from "bun:test";
import type { MapaConvenioPaciente } from "@/lib/convenio/modalidade";
import {
  classificarMovimento,
  condicaoDoLancamento,
  favorecidoDoRepasse,
  linhaCasaComFiltro,
  resumoMovimento,
  rotuloFiltro,
  servicoDaDescricao,
  type ContextoClassificacao,
  type LinhaMovimento,
} from "./movimento-resultado";

const CATEGORIAS: Record<string, string> = {
  rep: "REPASSE MEDICO",
  ter: "REPASSE TERCEIRO",
  comp: "COMPLEMENTO MEDICO",
  iptu: "IPTU",
  ades: "TAXA DE ADESAO CARTAO",
  mens: "MENSALIDADE CARTAO CONSULTA",
};

const mapa: MapaConvenioPaciente = new Map([
  [
    "pac-cartao",
    {
      contratoId: "c1",
      convenioId: "v1",
      convenioNome: "CARTÃO CONSULTA",
      modalidade: "cartao_consulta",
    },
  ],
]);

const ctx: ContextoClassificacao = {
  periodo: { de: "2026-09-10", ate: "2026-09-10" },
  procTipos: new Map([
    ["CONSULTA", "consulta"],
    ["ULTRASSONOGRAFIA", "exame"],
    ["INFILTRACAO", "procedimento"],
  ]),
  mapaConvenio: mapa,
  nomeCategoria: (id) => (id ? (CATEGORIAS[id] ?? null) : null),
};

let seq = 0;
const l = (p: Partial<LinhaMovimento>): LinhaMovimento => ({
  id: `l${++seq}`,
  tipo: "receita",
  descricao: "PACIENTE — CONSULTA",
  valor: 100,
  data: "2026-09-10",
  categoria_id: null,
  forma_pagamento: "dinheiro",
  ...p,
});

describe("servicoDaDescricao", () => {
  it("lê o serviço depois do travessão", () => {
    expect(servicoDaDescricao("MARIA — EXAMES LABORATORIAIS")).toBe("EXAMES LABORATORIAIS");
    expect(servicoDaDescricao("SEM TRAVESSAO")).toBeNull();
  });
});

describe("condicaoDoLancamento", () => {
  it("empresa conveniada é convênio", () => {
    expect(condicaoDoLancamento({ descricao: "X", empresa_id: "e1" }, mapa)).toBe("convenio");
  });
  it("modalidade gravada ou contrato ativo do paciente é cartão", () => {
    expect(
      condicaoDoLancamento({ descricao: "X", convenio_modalidade: "cartao_consulta" }, mapa),
    ).toBe("cartao");
    expect(condicaoDoLancamento({ descricao: "X", paciente_id: "pac-cartao" }, mapa)).toBe(
      "cartao",
    );
  });
  it("sem vínculo é particular", () => {
    expect(condicaoDoLancamento({ descricao: "X", paciente_id: "outro" }, mapa)).toBe("particular");
  });
});

describe("classificarMovimento", () => {
  it("atendimento com serviço do cadastro vira consulta ou exame", () => {
    const [a, b, c] = classificarMovimento(
      [
        l({ agendamento_id: "a1", procedimento: "CONSULTA (CARDIOLOGIA)" }),
        l({ agendamento_id: "a2", procedimento: "ULTRASSONOGRAFIA" }),
        l({ agendamento_id: "a3", procedimento: "INFILTRACAO" }),
      ],
      ctx,
    );
    expect([a.grupo, b.grupo, c.grupo]).toEqual([
      "consulta",
      "exame_procedimento",
      "exame_procedimento",
    ]);
  });

  it("laboratório com serviço em branco na agenda é exame, não 'Outros'", () => {
    const [x] = classificarMovimento(
      [l({ agendamento_id: "a4", procedimento: null, descricao: "JOSE — EXAMES LABORATORIAIS" })],
      ctx,
    );
    expect(x.grupo).toBe("exame_procedimento");
    expect(x.condicao).toBe("particular");
  });

  it("sem agendamento nem mensalidade é recebimento avulso", () => {
    const [x] = classificarMovimento([l({ descricao: "ACERTO — CONSULTA" })], ctx);
    expect(x.grupo).toBe("avulso");
    expect(x.condicao).toBeNull();
  });

  it("adesão e mensalidade continuam separadas", () => {
    const [a, m] = classificarMovimento(
      [
        l({ categoria_id: "ades" }),
        l({ mensalidadeVencimento: "2026-09-10", mensalidadeParcela: 3, categoria_id: "mens" }),
      ],
      ctx,
    );
    expect(a.grupo).toBe("adesao");
    expect(m.grupo).toBe("mensalidade_periodo");
  });

  it("despesa ganha o grupo do Dashboard", () => {
    const d = classificarMovimento(
      [
        l({ tipo: "despesa", categoria_id: "rep", descricao: "REPASSE MEDICO — ISIS (3 ATEND.)" }),
        l({ tipo: "despesa", descricao: "REPASSE MEDICO — SAMUEL (17 ATEND.)" }),
        l({ tipo: "despesa", categoria_id: "comp" }),
        l({ tipo: "despesa", categoria_id: "iptu" }),
      ],
      ctx,
    );
    expect(d.map((x) => x.grupoDespesa)).toEqual([
      "repasse_pago",
      "repasse_pago",
      "complemento_medico",
      "operacional",
    ]);
  });
});

describe("resumoMovimento", () => {
  const linhas = classificarMovimento(
    [
      // Particular: consulta em dinheiro, exame em PIX
      l({ agendamento_id: "a1", procedimento: "CONSULTA", valor: 100 }),
      l({
        agendamento_id: "a1",
        procedimento: "ULTRASSONOGRAFIA",
        valor: 200,
        forma_pagamento: "pix",
      }),
      // Cartão: consulta paga em misto (duas partes do mesmo lançamento)
      l({
        id: "m#0",
        _mistoPaiId: "m",
        agendamento_id: "a2",
        procedimento: "CONSULTA",
        paciente_id: "pac-cartao",
        valor: 30,
        formaCanonica: "dinheiro",
      }),
      l({
        id: "m#1",
        _mistoPaiId: "m",
        agendamento_id: "a2",
        procedimento: "CONSULTA",
        paciente_id: "pac-cartao",
        valor: 20,
        formaCanonica: "credito",
      }),
      // Outras receitas
      l({ mensalidadeVencimento: "2026-08-10", mensalidadeParcela: 2, valor: 60 }),
      l({ descricao: "AVULSO", valor: 10 }),
      // Despesas
      l({ tipo: "despesa", categoria_id: "rep", descricao: "REPASSE MEDICO — ISIS", valor: 70 }),
      l({ tipo: "despesa", categoria_id: "comp", valor: 5 }),
      l({ tipo: "despesa", categoria_id: "iptu", valor: 40 }),
      // Sangria não é receita nem despesa
      l({ tipo: "transferencia", valor: 999 }),
    ],
    ctx,
  );
  const r = resumoMovimento(linhas);

  it("atendimentos por condição e tipo, com fichas distintas", () => {
    expect(r.atendimentos.total).toBe(350);
    expect(r.atendimentos.fichas).toBe(2);
    expect(r.atendimentos.porCondicao.particular.consulta).toEqual({ total: 100, qtd: 1 });
    expect(r.atendimentos.porCondicao.particular.exame).toEqual({ total: 200, qtd: 1 });
    // O misto conta como UM pagamento.
    expect(r.atendimentos.porCondicao.cartao.consulta).toEqual({ total: 50, qtd: 1 });
    expect(r.atendimentos.porCondicao.convenio.total).toBe(0);
  });

  it("quebra por forma fecha com a receita de atendimento", () => {
    expect(r.atendimentos.formas).toEqual([
      { rotulo: "Dinheiro", valor: 130 },
      { rotulo: "PIX", valor: 200 },
      { rotulo: "Cartão", valor: 20 },
    ]);
  });

  it("outras receitas, despesas separadas e saldo sem a sangria", () => {
    expect(r.outras.total).toBe(70);
    expect(r.outras.porGrupo.mensalidade_atrasada.total).toBe(60);
    expect(r.outras.porGrupo.avulso.total).toBe(10);
    expect(r.receitas).toBe(420);
    expect(r.repassePago.total).toBe(70);
    expect(r.complementoMedico.total).toBe(5);
    expect(r.operacionais.total).toBe(40);
    expect(r.despesas).toBe(115);
    expect(r.saldo).toBe(305);
  });

  it("o filtro do card pega só a condição e o tipo clicados", () => {
    const f = { grupo: "consulta" as const, condicao: "cartao" as const };
    expect(linhas.filter((x) => linhaCasaComFiltro(x, f)).map((x) => x.id)).toEqual(["m#0", "m#1"]);
    expect(rotuloFiltro(f)).toBe("Consultas · Cartão Benefícios");
  });
});

describe("favorecidoDoRepasse", () => {
  it("usa o médico do cadastro ou o nome da descrição", () => {
    expect(favorecidoDoRepasse({ medico_nome: "DRA ISIS", descricao: "x" })).toBe("DRA ISIS");
    expect(favorecidoDoRepasse({ descricao: "REPASSE MEDICO — SAMUEL JOSE (17 ATEND.)" })).toBe(
      "SAMUEL JOSE",
    );
    expect(favorecidoDoRepasse({ descricao: "REPASSE TERCEIRO X" })).toBe("REPASSE TERCEIRO X");
  });
});
