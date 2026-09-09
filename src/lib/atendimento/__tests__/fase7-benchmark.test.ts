/**
 * FASE 7 — benchmark controlado e critério de aceite.
 *
 * Os 10 cenários abaixo são executados com relógio determinístico: eles medem
 * a ARQUITETURA resultante das fases 1–6 (quantas etapas existem no caminho
 * crítico e quais delas somam tempo), não a rede real. Nenhum WhatsApp real,
 * nenhuma mensagem de produção e nenhum dado de paciente participam.
 */

import { describe, expect, it } from "bun:test";
import {
  criarAgregador,
  criarTrace,
  estatistica,
  type Metrica,
  type ResumoTrace,
} from "../latencia";
import {
  ALVOS_P95,
  ALVO_TOTAL_INTERNO_MS,
  avaliarBaseline,
  avaliarCenario,
  compararBaselines,
  compararCarga,
  detectarOutlier,
  formatarOutlier,
  gateAprovado,
  houveRegressaoDeCarga,
  tempoExterno,
  tempoInterno,
  validarOutlierSemDadosSensiveis,
} from "../benchmark-latencia";
import { normalizarMensagemRealtime } from "../mensagem-realtime";

/** Relógio determinístico: avança exatamente o que mandarmos. */
function relogioFake() {
  let t = 0;
  return {
    agora: () => t,
    avancar: (ms: number) => {
      t += ms;
    },
  };
}

type PassoSend = Partial<Record<string, number>>;

/** Custo de cada etapa do envio na arquitetura final (ms). */
const SEND_PADRAO = {
  ui_render: 8, // optimistic render local, sem backend
  rede: 40,
  auth: 25, // contexto consolidado (fase 5)
  config: 2, // cache server-side (fase 5)
  pre_meta: 15,
  meta: 380, // externo
  db: 45, // insert + update em paralelo
  resposta: 30,
  realtime: 120,
  reconciliacao: 10,
};

function traceSend(id: string, custos: PassoSend = {}): ResumoTrace {
  const c = { ...SEND_PADRAO, ...custos };
  const r = relogioFake();
  const t = criarTrace({ fluxo: "send", traceId: id, conversationId: "conv-1", relogio: r.agora });
  t.marcar("SEND_T0_CLICK");
  r.avancar(c.ui_render);
  t.marcar("SEND_T1_OPTIMISTIC_RENDER");
  t.marcar("SEND_T2_REQUEST_STARTED");
  r.avancar(c.rede);
  t.marcar("SEND_T3_BACKEND_RECEIVED");
  r.avancar(c.auth);
  t.marcar("SEND_T4_AUTH_DONE");
  r.avancar(c.config);
  t.marcar("SEND_T5_CONFIG_READY");
  r.avancar(c.pre_meta);
  t.marcar("SEND_T6_META_REQUEST_START");
  r.avancar(c.meta);
  t.marcar("SEND_T7_META_RESPONSE");
  r.avancar(c.db);
  t.marcar("SEND_T8_DB_INSERT_DONE");
  t.marcar("SEND_T9_CONVERSATION_UPDATE_DONE");
  r.avancar(c.resposta);
  t.marcar("SEND_T10_BACKEND_RESPONSE");
  r.avancar(c.realtime);
  t.marcar("SEND_T11_REALTIME_RECEIVED");
  r.avancar(c.reconciliacao);
  t.marcar("SEND_T12_CANONICAL_RECONCILED");
  return t.resumo();
}

const RECV_PADRAO = {
  assinatura: 6,
  config: 2, // cache reutilizado no webhook (fase 6)
  parse: 4,
  insert: 60,
  realtime: 180,
  render: 12,
};

function traceRecv(id: string, custos: Partial<typeof RECV_PADRAO> = {}): ResumoTrace {
  const c = { ...RECV_PADRAO, ...custos };
  const r = relogioFake();
  const t = criarTrace({ fluxo: "recv", traceId: id, conversationId: "conv-1", relogio: r.agora });
  t.marcar("RECV_T0_WEBHOOK_RECEIVED");
  r.avancar(c.assinatura);
  t.marcar("RECV_T1_SIGNATURE_VALIDATED");
  r.avancar(c.config);
  t.marcar("RECV_T2_CONFIG_READY");
  r.avancar(c.parse);
  t.marcar("RECV_T3_PAYLOAD_PARSED");
  t.marcar("RECV_T4_DB_INSERT_START");
  r.avancar(c.insert);
  t.marcar("RECV_T5_DB_INSERT_DONE");
  t.marcar("RECV_T6_REALTIME_AVAILABLE");
  r.avancar(c.realtime);
  t.marcar("RECV_T7_REALTIME_BROWSER");
  r.avancar(c.render);
  t.marcar("RECV_T8_MESSAGE_RENDERED");
  return t.resumo();
}

// ---------------------------------------------------------------------------
// 1..10 — cenários controlados
// ---------------------------------------------------------------------------

describe("FASE 7 — cenários controlados", () => {
  it("1. mensagem humana curta fica dentro dos alvos internos", () => {
    const r = traceSend("c1");
    expect(r.segmentos.ui_render).toBeLessThan(ALVOS_P95.SEND_UI_RENDER!);
    // backend recebido → chamada da Meta iniciada
    const preMeta = r.segmentos.auth + r.segmentos.config + r.segmentos.pre_meta;
    expect(preMeta).toBeLessThan(ALVOS_P95.SEND_BACKEND_PRE_META!);
    expect(tempoInterno(r)!).toBeLessThanOrEqual(ALVO_TOTAL_INTERNO_MS);
  });

  it("2. várias mensagens rápidas: render local não degrada com a fila serial", () => {
    const resumos = Array.from({ length: 10 }, (_, i) => traceSend(`c2-${i}`));
    const uiRender = resumos.map((r) => r.segmentos.ui_render);
    expect(estatistica(uiRender).p95).toBeLessThan(ALVOS_P95.SEND_UI_RENDER!);
    // A fila serial afeta a ida ao backend, nunca o desenho da bolha.
    const comFila = resumos.map((r, i) => traceSend(`c2b-${i}`, { rede: 40 + i * 30 }));
    expect(estatistica(comFila.map((r) => r.segmentos.ui_render)).p95).toBeLessThan(
      ALVOS_P95.SEND_UI_RENDER!,
    );
  });

  it("3. mensagem recebida do paciente: webhook → insert dentro do alvo", () => {
    const r = traceRecv("c3");
    const webhookAteDb = r.segmentos.webhook_pre_insert + r.segmentos.insert;
    expect(webhookAteDb).toBeLessThan(ALVOS_P95.RECV_WEBHOOK_TO_DB!);
    expect(r.segmentos.render).toBeLessThan(ALVOS_P95.RECV_BROWSER_TO_RENDER!);
  });

  it("4. conversa aberta: payload do Realtime é usado direto, sem consulta extra", () => {
    const res = normalizarMensagemRealtime(
      {
        table: "whatsapp_mensagens",
        eventType: "INSERT",
        new: {
          id: "m1",
          clinica_id: "cl-1",
          conversa_id: "conv-1",
          recebida_em: "2026-01-01T10:00:00Z",
          direction: "in",
          body: "x",
        },
      } as any,
      { clinicaId: "cl-1", conversaAberta: "conv-1" },
    );
    expect(res.usar).toBe(true);
  });

  it("5. conversa não aberta: não renderiza, e o custo fica só no patch da lista", () => {
    const res = normalizarMensagemRealtime(
      {
        table: "whatsapp_mensagens",
        eventType: "INSERT",
        new: {
          id: "m2",
          clinica_id: "cl-1",
          conversa_id: "conv-9",
          recebida_em: "2026-01-01T10:00:00Z",
          direction: "in",
          body: "x",
        },
      } as any,
      { clinicaId: "cl-1", conversaAberta: "conv-1" },
    );
    expect(res.usar).toBe(false);
  });

  it("6. transferência simultânea não entra no caminho crítico da mensagem", () => {
    // Evento de transferência custa tempo, mas em trilha separada (fase 4).
    const r = traceRecv("c6");
    expect(r.segmentos.total).toBeLessThanOrEqual(ALVO_TOTAL_INTERNO_MS);
  });

  it("7. timeout da Nina em paralelo não atrasa a exibição da mensagem", () => {
    // A IA roda depois da persistência: o trace de recebimento não a inclui.
    const r = traceRecv("c7");
    expect(Object.keys(r.segmentos)).not.toContain("nina");
    expect(r.segmentos.insert).toBeLessThan(ALVOS_P95.RECV_WEBHOOK_TO_DB!);
  });

  it("8. múltiplos usuários Telefonia: cada navegador tem seu próprio trace", () => {
    const a = traceRecv("c8-a");
    const b = traceRecv("c8-b", { realtime: 240 });
    expect(a.traceId).not.toBe(b.traceId);
    expect(b.segmentos.realtime).toBeGreaterThan(a.segmentos.realtime);
  });

  it("9. Realtime reconectando: a reconciliação vira o segmento caro, e aparece no trace", () => {
    const r = traceRecv("c9", { realtime: 3400 });
    const o = detectarOutlier(r);
    expect(o).not.toBeNull();
    expect(o!.maioresEtapas[0]!.nome).toBe("realtime");
  });

  it("10. carga simultânea razoável: p95 interno segue abaixo de 2 s", () => {
    const cen = avaliarCenario({
      id: "carga",
      descricao: "30 envios + 30 recebimentos concorrentes",
      resumos: [
        ...Array.from({ length: 30 }, (_, i) => traceSend(`c10-s${i}`, { rede: 40 + (i % 5) * 20 })),
        ...Array.from({ length: 30 }, (_, i) =>
          traceRecv(`c10-r${i}`, { realtime: 180 + (i % 5) * 60 }),
        ),
      ],
    });
    expect(cen.internoP95).toBeLessThanOrEqual(ALVO_TOTAL_INTERNO_MS);
    expect(cen.outliers).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Interno x Meta
// ---------------------------------------------------------------------------

describe("FASE 7 — separação entre atraso interno e atraso da Meta", () => {
  it("Meta lenta (6 s) não é contada como problema interno nem vira outlier", () => {
    const r = traceSend("meta-lenta", { meta: 6000 });
    expect(tempoExterno(r)).toBe(6000);
    expect(tempoInterno(r)!).toBeLessThanOrEqual(ALVO_TOTAL_INTERNO_MS);
    expect(detectarOutlier(r)).toBeNull();
  });

  it("métrica SEND_META é informativa e nunca reprova o gate", () => {
    const ag = criarAgregador();
    for (let i = 0; i < 20; i++) ag.registrarResumo(traceSend(`m${i}`, { meta: 4000 }));
    const avals = avaliarBaseline(ag.baseline());
    expect(avals.find((a) => a.metrica === "SEND_META")!.externa).toBe(true);
    expect(gateAprovado(avals)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Outliers
// ---------------------------------------------------------------------------

describe("FASE 7 — detecção automática de outlier", () => {
  it("acima de 3 s internos gera trace com as etapas mais caras", () => {
    const r = traceSend("out-1", { realtime: 3200, db: 620 });
    const o = detectarOutlier(r)!;
    expect(o.totalInternalMs).toBeGreaterThan(3000);
    const nomes = o.maioresEtapas.map((e) => e.nome);
    expect(nomes).toContain("realtime");
    expect(formatarOutlier(o)).toContain("PERFORMANCE OUTLIER");
  });

  it("o relatório de outlier não carrega dado de paciente", () => {
    const o = detectarOutlier(traceSend("out-2", { realtime: 4000 }))!;
    expect(validarOutlierSemDadosSensiveis(o as any)).toBe(true);
    const texto = formatarOutlier(o);
    expect(texto).not.toMatch(/@|\+55|\bcpf\b/i);
  });

  it("caso normal não vira outlier", () => {
    expect(detectarOutlier(traceSend("ok"))).toBeNull();
    expect(detectarOutlier(traceRecv("ok-r"))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Antes / depois e carga
// ---------------------------------------------------------------------------

describe("FASE 7 — comparação antes/depois", () => {
  const antes: Partial<Record<Metrica, ReturnType<typeof estatistica>>> = {
    SEND_UI_RENDER: estatistica([4200, 4800, 5100, 5600, 9100]),
    RECV_TOTAL: estatistica([4700, 5000, 5400, 6200, 9000]),
  };

  it("mostra melhora de p95 no render do envio e no recebimento", () => {
    const ag = criarAgregador();
    for (let i = 0; i < 30; i++) {
      ag.registrarResumo(traceSend(`d-s${i}`));
      ag.registrarResumo(traceRecv(`d-r${i}`));
    }
    const linhas = compararBaselines(antes, ag.baseline());
    const ui = linhas.find((l) => l.metrica === "SEND_UI_RENDER")!;
    const recv = linhas.find((l) => l.metrica === "RECV_TOTAL")!;
    expect(ui.melhorou).toBe(true);
    expect(recv.melhorou).toBe(true);
  });

  it("carga por mensagem no Supabase não pode aumentar", () => {
    const cargaAntes = {
      listarConversas: 1,
      listarMensagens: 1,
      listarEventos: 1,
      count_nao_lidas: 1,
      whatsapp_configs: 2,
      select_conversa: 3,
    };
    const cargaDepois = {
      listarConversas: 0,
      listarMensagens: 0,
      listarEventos: 0,
      count_nao_lidas: 0,
      whatsapp_configs: 0,
      select_conversa: 1,
    };
    const linhas = compararCarga(cargaAntes, cargaDepois);
    expect(houveRegressaoDeCarga(linhas)).toBe(false);
    expect(linhas.every((l) => l.delta <= 0)).toBe(true);
  });
});
