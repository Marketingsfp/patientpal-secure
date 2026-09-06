import { describe, expect, it } from "bun:test";
import {
  FERRAMENTAS_ANALISTA,
  INSTRUCOES_ANALISTA,
  MODELO_ANALISTA,
  NOMES_FERRAMENTAS,
  mascararPergunta,
  mesclarRecorte,
  periodosNomeados,
  validarResposta,
  valoresPermitidos,
  type RespostaAnalista,
} from "@/lib/nina/analista-metricas";
import { compararIndicadores, compararTaxas } from "@/lib/nina/metricas-analise";

const FUSO = "America/Sao_Paulo";

function respostaBase(over: Partial<RespostaAnalista> = {}): RespostaAnalista {
  return {
    resumo: "resumo",
    recorte_utilizado: "01/09 a 30/09, dia inteiro",
    indicadores: [],
    comparacoes: [],
    o_que_os_dados_mostram: [],
    interpretacao_possivel: [],
    hipoteses_a_investigar: [],
    evidencias: [],
    pontos_de_atencao: [],
    recomendacoes: [],
    limitacoes: [],
    precisa_esclarecimento: false,
    pergunta_ao_usuario: null,
    ...over,
  };
}

const dadosConsulta = {
  periodos: [
    {
      indicadores: { mensagensTotais: 200, errosReportados: 3 },
      medias: { errosPorDia: 1.5 },
      taxaErro: { valor: 1.5, numerador: 3, denominador: 200 },
      cobertura: { dias: 2, horas: 10 },
      serie: [],
    },
  ],
  consolidado: { valor: 1.5, numerador: 3, denominador: 200 },
  comparacao: null,
};

describe("ferramentas autorizadas", () => {
  it("é uma lista fechada de consultas somente leitura", () => {
    expect(NOMES_FERRAMENTAS).toEqual(["consultar_metricas", "obter_configuracao"]);
    for (const f of FERRAMENTAS_ANALISTA) {
      expect(f.type).toBe("function");
      expect(f.parameters.additionalProperties).toBe(false);
    }
    const texto = JSON.stringify(FERRAMENTAS_ANALISTA).toLowerCase();
    for (const proibido of ["sql", "shell", "fetch", "enviar", "agendar", "transferir", "atualizar"]) {
      expect(texto).not.toContain(proibido);
    }
  });

  it("usa o modelo pedido, sem troca silenciosa", () => {
    expect(MODELO_ANALISTA).toBe("openai/gpt-5.6-sol");
  });

  it("as instruções proíbem inventar dados e exigem separar dados de interpretação", () => {
    expect(INSTRUCOES_ANALISTA).toContain("PONTOS PERCENTUAIS");
    expect(INSTRUCOES_ANALISTA).toContain("Associação não é causa");
    expect(INSTRUCOES_ANALISTA).toContain("não são auditoria de todas as respostas");
  });
});

describe("expressões de tempo", () => {
  it("resolve hoje, ontem, este mês e mês passado a partir da data do servidor", () => {
    const p = periodosNomeados(new Date("2026-09-06T16:00:00Z"), FUSO);
    expect(p.hoje).toEqual({ de: "2026-09-06", ate: "2026-09-06", parcial: true });
    expect(p.ontem.de).toBe("2026-09-05");
    expect(p.este_mes).toEqual({ de: "2026-09-01", ate: "2026-09-06", parcial: true });
    expect(p.mes_passado).toEqual({ de: "2026-08-01", ate: "2026-08-31", parcial: false });
    expect(p.ultimos_7_dias.de).toBe("2026-08-31");
  });

  it("vira o ano corretamente em janeiro", () => {
    const p = periodosNomeados(new Date("2026-01-10T15:00:00Z"), FUSO);
    expect(p.mes_passado).toEqual({ de: "2025-12-01", ate: "2025-12-31", parcial: false });
  });
});

describe("continuidade entre perguntas", () => {
  const base = {
    de: "2026-09-01",
    ate: "2026-09-30",
    diaInteiro: false,
    horaInicio: "07:00",
    horaFim: "12:00",
    diasSemana: null,
  };

  it("pedir o mês inteiro limpa a faixa de horário anterior", () => {
    const novo = mesclarRecorte(base, { diaInteiro: true });
    expect(novo.horaInicio).toBeNull();
    expect(novo.horaFim).toBeNull();
    expect(novo.de).toBe("2026-09-01");
  });

  it("mudar só os sábados preserva o restante do recorte", () => {
    const novo = mesclarRecorte(base, { diasSemana: [6] });
    expect(novo).toEqual({ ...base, diasSemana: [6] });
  });

  it("informar horário desliga o dia inteiro", () => {
    const novo = mesclarRecorte({ ...base, diaInteiro: true, horaInicio: null, horaFim: null }, {
      horaInicio: "08:00",
      horaFim: "12:00",
    });
    expect(novo.diaInteiro).toBe(false);
  });
});

describe("privacidade da pergunta", () => {
  it("mascara telefone, documento e e-mail antes de sair do servidor", () => {
    const m = mascararPergunta(
      "o paciente (11) 98888-7777, cpf 123.456.789-00, joao@ex.com reclamou",
    );
    expect(m).toContain("[telefone]");
    expect(m).toContain("[documento]");
    expect(m).toContain("[email]");
    expect(m).not.toContain("98888");
    expect(m).not.toContain("joao@ex.com");
  });
});

describe("validação da resposta", () => {
  const permitidos = valoresPermitidos([{ id: "consulta_1", dados: dadosConsulta }]);

  it("aceita valores que vieram das consultas", () => {
    const r = validarResposta(
      respostaBase({
        indicadores: [
          { chave: "mensagensTotais", rotulo: "Mensagens", valor: 200, consulta_id: "consulta_1", periodo: "set" },
          { chave: "taxaErro", rotulo: "Taxa", valor: 1.5, consulta_id: "consulta_1", periodo: "set" },
        ],
        evidencias: [{ afirmacao: "x", consulta_id: "consulta_1", indicadores: ["taxaErro"] }],
      }),
      permitidos,
    );
    expect(r.valida).toBe(true);
  });

  it("rejeita número que o modelo inventou", () => {
    const r = validarResposta(
      respostaBase({
        indicadores: [
          { chave: "mensagensTotais", rotulo: "Mensagens", valor: 250, consulta_id: "consulta_1", periodo: "set" },
        ],
      }),
      permitidos,
    );
    expect(r.valida).toBe(false);
    expect(r.problemas[0].detalhe).toContain("não confere");
  });

  it("rejeita citação de consulta inexistente", () => {
    const r = validarResposta(
      respostaBase({
        evidencias: [{ afirmacao: "x", consulta_id: "consulta_9", indicadores: [] }],
      }),
      permitidos,
    );
    expect(r.valida).toBe(false);
  });

  it("rejeita resposta que cita números sem nenhuma consulta executada", () => {
    const r = validarResposta(
      respostaBase({
        indicadores: [
          { chave: "mensagensTotais", rotulo: "Mensagens", valor: 10, consulta_id: "x", periodo: "p" },
        ] as any,
      }),
      new Map(),
    );
    expect(r.valida).toBe(false);
    expect(r.problemas[0].campo).toBe("consultas");
  });

  it("aceita recusa sem consulta e sem números (pedido fora do escopo autorizado)", () => {
    expect(validarResposta(respostaBase(), new Map()).valida).toBe(true);
  });

  it("aceita o id técnico do período como apelido da consulta", () => {
    const permitidosAlias = valoresPermitidos([
      {
        id: "consulta_1",
        dados: { ...dadosConsulta, periodos: [{ ...dadosConsulta.periodos[0], consultaId: "rpc_42" }] },
      },
    ]);
    const r = validarResposta(
      respostaBase({
        indicadores: [
          {
            chave: "mensagensTotais",
            rotulo: "Mensagens",
            valor: 200,
            consulta_id: "rpc_42",
            periodo: "p",
          },
        ] as any,
      }),
      permitidosAlias,
    );
    expect(r.valida).toBe(true);
  });

  it("aceita pedido de esclarecimento sem consulta, desde que a pergunta exista", () => {
    expect(
      validarResposta(
        respostaBase({ precisa_esclarecimento: true, pergunta_ao_usuario: "Qual intervalo é manhã?" }),
        new Map(),
      ).valida,
    ).toBe(true);
    expect(
      validarResposta(
        respostaBase({ precisa_esclarecimento: true, pergunta_ao_usuario: null }),
        new Map(),
      ).valida,
    ).toBe(false);
  });
});

describe("comparações determinísticas", () => {
  it("variação percentual e diferença absoluta vêm calculadas", () => {
    const c = compararIndicadores({ errosReportados: 4 }, { errosReportados: 5 });
    expect(c[0].diferencaAbsoluta).toBe(1);
    expect(c[0].variacaoPercentual).toBeCloseTo(25, 6);
  });

  it("taxas separam pontos percentuais de variação percentual", () => {
    const t = compararTaxas({ valor: 2 }, { valor: 3 });
    expect(t.diferencaPontosPercentuais).toBeCloseTo(1, 6);
    expect(t.variacaoPercentual).toBeCloseTo(50, 6);
  });

  it("sem base (zero ou taxa indisponível) não inventa variação", () => {
    expect(compararIndicadores({ x: 0 }, { x: 3 })[0].variacaoPercentual).toBeNull();
    expect(compararTaxas(null, { valor: 3 }).diferencaPontosPercentuais).toBeNull();
  });

  it("o validador aceita a variação calculada e recusa outra", () => {
    const permitidos = valoresPermitidos([
      {
        id: "consulta_1",
        dados: {
          periodos: [
            { indicadores: { errosReportados: 4 }, taxaErro: { valor: 2, numerador: 4, denominador: 200 }, cobertura: { dias: 1, horas: 5 } },
            { indicadores: { errosReportados: 5 }, taxaErro: { valor: 3, numerador: 5, denominador: 167 }, cobertura: { dias: 1, horas: 5 } },
          ],
          comparacao: {
            indicadores: compararIndicadores({ errosReportados: 4 }, { errosReportados: 5 }),
            taxaErro: compararTaxas({ valor: 2 }, { valor: 3 }),
          },
        },
      },
    ]);
    const ok = validarResposta(
      respostaBase({
        comparacoes: [
          { descricao: "erros", tipo: "percentual", valor: 25, consulta_id: "consulta_1" },
          { descricao: "taxa", tipo: "pontos_percentuais", valor: 1, consulta_id: "consulta_1" },
        ],
      }),
      permitidos,
    );
    expect(ok.valida).toBe(true);

    const ruim = validarResposta(
      respostaBase({
        comparacoes: [{ descricao: "erros", tipo: "percentual", valor: 80, consulta_id: "consulta_1" }],
      }),
      permitidos,
    );
    expect(ruim.valida).toBe(false);
  });
});
