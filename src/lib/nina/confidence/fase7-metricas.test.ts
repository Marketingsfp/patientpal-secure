/**
 * FASE 7 — medir resultados reais.
 *
 * Aceite: duas avaliações da mesma saída contam uma mensagem; handoff sugerido
 * e não realizado não é transferência; sem revisão o acerto é desconhecido;
 * homologação usa seus próprios reportes; reserva só conta com prova na agenda;
 * amostra e truncamento aparecem.
 */
import { describe, expect, it } from "vitest";
import {
  agruparSaidas,
  calcularAcertoObservado,
  calcularDenominadores,
  calcularResultadosConfirmados,
  classificarRevisao,
  classificarStatusReporte,
  descreverAmostra,
  indexarRevisoes,
  normalizarAmbiente,
  variantesAmbiente,
  type LinhaSaida,
} from "./denominadores";
import { amostrarEstratificado, calibrar, type LinhaCalibracao } from "./calibracao";

const saida = (over: Partial<LinhaSaida> = {}): LinhaSaida => ({
  id: crypto.randomUUID(),
  created_at: "2026-09-01T12:00:00Z",
  ambiente: "producao",
  conversation_id: "conv-1",
  outgoing_message_id: "msg-1",
  avaliacao: "answer_confidence",
  ...over,
});

describe("ambiente", () => {
  it("normaliza os nomes divergentes do schema real", () => {
    expect(normalizarAmbiente("production")).toBe("producao");
    expect(normalizarAmbiente("homologation")).toBe("homologacao");
    expect(normalizarAmbiente("HOMOLOGAÇÃO")).toBe("homologacao");
    expect(normalizarAmbiente(null)).toBe("desconhecido");
  });

  it("oferece todas as variantes para o filtro de consulta", () => {
    expect(variantesAmbiente("homologacao")).toContain("homologation");
    expect(variantesAmbiente("producao")).toContain("producao");
  });
});

describe("denominadores", () => {
  it("conta uma mensagem quando a mesma saída tem resposta e ação", () => {
    const linhas = [
      saida({ avaliacao: "answer_confidence" }),
      saida({ avaliacao: "action_safety", acao_solicitada: "agendamento" }),
    ];
    const d = calcularDenominadores(linhas);
    expect(d.mensagensDeSaida).toBe(1);
    expect(d.avaliacoesResposta).toBe(1);
    expect(d.avaliacoesAcao).toBe(1);
    expect(d.avaliacoesTotais).toBe(2);
    expect(d.operacoes).toBe(1);
    expect(agruparSaidas(linhas)).toHaveLength(1);
  });

  it("soma rodadas sem usá-las como denominador de mensagens", () => {
    const d = calcularDenominadores([saida({ rodadas: 3 })]);
    expect(d.rodadas).toBe(3);
    expect(d.mensagensDeSaida).toBe(1);
  });
});

describe("revisão humana e acerto", () => {
  const unidade = (msg: string) => agruparSaidas([saida({ outgoing_message_id: msg })])[0]!;

  it("classifica pendente, confirmado e descartado", () => {
    expect(classificarStatusReporte("pending")).toBe("ERRO_REPORTADO");
    expect(classificarStatusReporte("approved")).toBe("ERRO_CONFIRMADO");
    expect(classificarStatusReporte("rejected")).toBe("REPORTE_DESCARTADO");
  });

  it("ausência de reporte é 'não revisada', nunca acerto", () => {
    const idx = indexarRevisoes([]);
    expect(classificarRevisao(unidade("m1"), idx)).toBe("NAO_REVISADA");
    const acerto = calcularAcertoObservado([unidade("m1")], idx);
    expect(acerto.disponivel).toBe(false);
    expect(acerto.taxaAcerto).toBeNull();
  });

  it("reporte só por conversa fica isolado como legado", () => {
    const idx = indexarRevisoes([
      {
        id: "e1",
        conversa_id: "conv-1",
        mensagem_id: null,
        execucao_id: null,
        status: "approved",
        created_at: "2026-09-01T13:00:00Z",
      },
    ]);
    expect(classificarRevisao(unidade("m1"), idx)).toBe("LEGADO_SEM_VINCULO");
  });

  it("calcula acerto apenas sobre revisados, com cobertura", () => {
    const unidades = agruparSaidas(
      Array.from({ length: 30 }, (_, i) => saida({ outgoing_message_id: `m${i}` })),
    );
    const idx = indexarRevisoes(
      Array.from({ length: 5 }, (_, i) => ({
        id: `e${i}`,
        conversa_id: "conv-1",
        mensagem_id: `m${i}`,
        execucao_id: null,
        status: "approved",
        created_at: "2026-09-01T13:00:00Z",
      })),
      Array.from({ length: 20 }, (_, i) => `m${i + 5}`),
    );
    const acerto = calcularAcertoObservado(unidades, idx);
    expect(acerto.revisadas).toBe(25);
    expect(acerto.errosConfirmados).toBe(5);
    expect(acerto.taxaAcerto).toBe(80);
    expect(acerto.cobertura).toBeCloseTo(83.3, 1);
  });
});

describe("resultados confirmados", () => {
  it("handoff sugerido sem prova não conta como transferência", () => {
    const r = calcularResultadosConfirmados([
      saida({ avaliacao: "action_safety", decisao: "HANDOFF", handoff_ocorreu: false }),
    ]);
    expect(r.transferenciasRecomendadas).toBe(1);
    expect(r.transferenciasConfirmadas).toBe(0);
    expect(r.transferenciasSemProva).toBe(1);
  });

  it("shadow fica como observação, não como atendimento transferido", () => {
    const r = calcularResultadosConfirmados([
      saida({ avaliacao: "action_safety", decisao: "HANDOFF", modo: "shadow" }),
    ]);
    expect(r.transferenciasEmObservacao).toBe(1);
    expect(r.transferenciasAplicadas).toBe(0);
    expect(r.transferenciasConfirmadas).toBe(0);
  });

  it("transferência confirmada pelo atendimento conta uma vez", () => {
    const r = calcularResultadosConfirmados(
      [saida({ avaliacao: "action_safety", decisao: "HANDOFF" })],
      [{ conversa_id: "conv-1", houveHandoff: true }],
    );
    expect(r.transferenciasConfirmadas).toBe(1);
    expect(r.transferenciasSemProva).toBe(0);
  });

  it("reserva só entra como confirmada com prova na agenda", () => {
    const r = calcularResultadosConfirmados(
      [saida()],
      [],
      [
        { conversa_id: "conv-1", agendamento_id: "ag-1", existeNaAgenda: true },
        { conversa_id: "conv-1", agendamento_id: "ag-2", existeNaAgenda: false },
      ],
    );
    expect(r.agendamentosConfirmados).toBe(1);
    expect(r.agendamentosSemProva).toBe(1);
  });
});

describe("amostra e calibração", () => {
  it("declara recorte parcial ao bater no teto", () => {
    expect(descreverAmostra(5000, 5000, 4200).truncado).toBe(true);
    expect(descreverAmostra(120, 5000, 100).truncado).toBe(false);
  });

  const decisao = (over: Partial<LinhaCalibracao>): LinhaCalibracao => ({
    id: crypto.randomUUID(),
    created_at: "2026-09-01T12:00:00Z",
    ambiente: "producao",
    conversation_id: "c1",
    message_id: null,
    execucao_id: null,
    score: 95,
    nivel: "HIGH",
    decisao: "ALLOW",
    resultado_final: null,
    acao_solicitada: null,
    bloqueadores: [],
    reason_codes: [],
    categorias: [],
    validadores: [],
    ...over,
  });

  it("usa amostra estratificada e controla a versão da política", () => {
    const decisoes = [
      ...Array.from({ length: 40 }, () => decisao({ score: 95, policy_version: "v5" })),
      ...Array.from({ length: 10 }, () => decisao({ score: 60, policy_version: "v5" })),
      ...Array.from({ length: 10 }, () => decisao({ score: 95, policy_version: "v4" })),
    ];
    const r = calibrar(decisoes, [], [], undefined, {
      politicaVersao: "v5",
      amostraPorFaixa: 20,
    });
    expect(r.amostra.elegiveis).toBe(50);
    expect(r.amostra.usadas).toBe(30);
    expect(r.amostra.estratificada).toBe(true);
    expect(r.amostra.politicaVersao).toBe("v5");
    expect(amostrarEstratificado(decisoes, 5)).toHaveLength(15);
  });

  it("ignora decisões em modo observacional e reportes não confirmados", () => {
    const decisoes = [
      decisao({ modo: "shadow" }),
      decisao({ message_id: "m1" }),
    ];
    const r = calibrar(
      decisoes,
      [
        {
          id: "e1",
          conversa_id: "c1",
          mensagem_id: "m1",
          execucao_id: null,
          categoria: null,
          created_at: "2026-09-01T13:00:00Z",
          status: "pending",
        },
      ],
      [],
    );
    expect(r.total).toBe(1);
    expect(r.comErroReportado).toBe(0);
    expect(r.reportesPendentes).toBe(1);
  });

  it("marca bloqueio indevido quando não houve transferência real nem erro", () => {
    const r = calibrar(
      [decisao({ decisao: "HANDOFF", score: 40 })],
      [],
      [{ conversa_id: "c1", status: "resolvido", houveHandoff: false, agendamentoConfirmado: null }],
    );
    expect(r.bloqueioIndevido).toBe(1);
  });
});
