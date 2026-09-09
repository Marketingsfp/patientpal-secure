/**
 * FASE 1 — testes da telemetria de latência do atendimento.
 *
 * Cobrem: linha do tempo do envio, linha do tempo do recebimento, separação
 * entre tempo da Meta e tempo interno, medição de subprocessos lentos,
 * agregação p50/p95/p99/máximo e ausência de dado sensível no log.
 */
import { describe, expect, it } from "bun:test";
import {
  criarAgregador,
  criarTrace,
  estatistica,
  formatarResumo,
  linhaLog,
  metricasDoResumo,
  percentil,
  validarLinhaLog,
} from "../latencia";

function relogioFalso(sequencia: number[]) {
  let i = 0;
  return () => sequencia[Math.min(i++, sequencia.length - 1)]!;
}

describe("trace de envio (SEND)", () => {
  const trace = criarTrace({ fluxo: "send", conversationId: "c1", traceId: "tr-1" });
  const t = (n: number) => n;
  trace.marcar("SEND_T0_CLICK", t(0));
  trace.marcar("SEND_T1_OPTIMISTIC_RENDER", t(20));
  trace.marcar("SEND_T2_REQUEST_STARTED", t(40));
  trace.marcar("SEND_T3_BACKEND_RECEIVED", t(120));
  trace.marcar("SEND_T4_AUTH_DONE", t(330));
  trace.marcar("SEND_T5_CONFIG_READY", t(510));
  trace.marcar("SEND_T6_META_REQUEST_START", t(520));
  trace.marcar("SEND_T7_META_RESPONSE", t(7390));
  trace.marcar("SEND_T8_DB_INSERT_DONE", t(7730));
  trace.marcar("SEND_T9_CONVERSATION_UPDATE_DONE", t(7800));
  trace.marcar("SEND_T10_BACKEND_RESPONSE", t(7810));
  trace.marcar("SEND_T12_CANONICAL_RECONCILED", t(8000));
  const r = trace.resumo();

  it("mede o envio ponta a ponta", () => {
    expect(r.totalMs).toBe(8000);
  });

  it("separa o tempo da Meta do tempo interno", () => {
    expect(r.segmentos.meta_api).toBe(6870);
    expect(r.segmentos.auth).toBe(210);
    expect(r.segmentos.config).toBe(180);
    expect(r.segmentos.db_pos_meta).toBe(340);
    expect(r.segmentos.reconciliacao).toBe(190);
    expect(r.segmentos.backend_total).toBe(7690);
  });

  it("aponta o segmento responsável pelo pico", () => {
    expect(r.maiorSegmento?.nome).toBe("meta_api");
  });

  it("produz um resumo legível", () => {
    expect(formatarResumo(r)).toContain("SEND TOTAL: 8000 ms");
    expect(formatarResumo(r)).toContain("meta_api: 6870 ms");
  });

  it("primeira marca vence (retry não reescreve a linha do tempo)", () => {
    trace.marcar("SEND_T0_CLICK", 999);
    expect(trace.marcas()["SEND_T0_CLICK"]).toBe(0);
  });
});

describe("trace de recebimento (RECV)", () => {
  const trace = criarTrace({ fluxo: "recv", conversationId: "c2" });
  trace.marcar("RECV_T0_WEBHOOK_RECEIVED", 0);
  trace.marcar("RECV_T1_SIGNATURE_VALIDATED", 100);
  trace.marcar("RECV_T2_CONFIG_READY", 220);
  trace.marcar("RECV_T3_PAYLOAD_PARSED", 250);
  trace.marcar("RECV_T4_DB_INSERT_START", 320);
  trace.marcar("RECV_T5_DB_INSERT_DONE", 430);
  trace.marcar("RECV_T7_REALTIME_BROWSER", 610);
  trace.marcar("RECV_T8_MESSAGE_RENDERED", 8310);
  const r = trace.resumo();

  it("mede o recebimento ponta a ponta", () => {
    expect(r.totalMs).toBe(8310);
    expect(r.segmentos.webhook_pre_insert).toBe(320);
    expect(r.segmentos.insert).toBe(110);
    expect(r.segmentos.realtime).toBe(180);
    expect(r.segmentos.render).toBe(7700);
  });

  it("converte em métricas nomeadas", () => {
    const m = metricasDoResumo(r);
    expect(m.RECV_WEBHOOK_TO_DB).toBe(430);
    expect(m.RECV_DB_TO_BROWSER).toBe(180);
    expect(m.RECV_BROWSER_TO_RENDER).toBe(7700);
    expect(m.RECV_TOTAL).toBe(8310);
  });
});

describe("subprocessos lentos", () => {
  it("mede a duração de uma query/chamada", async () => {
    const trace = criarTrace({ fluxo: "sub", relogio: relogioFalso([1000, 1340]) });
    const v = await trace.medir("listarEventosConversa", async () => 42);
    expect(v).toBe(42);
    expect(trace.subprocessos()["listarEventosConversa"]).toBe(340);
  });

  it("registra a duração mesmo quando a chamada falha", async () => {
    const trace = criarTrace({ fluxo: "sub", relogio: relogioFalso([0, 500]) });
    await expect(
      trace.medir("listarMensagens", async () => {
        throw new Error("falhou");
      }),
    ).rejects.toThrow();
    expect(trace.subprocessos()["listarMensagens"]).toBe(500);
  });
});

describe("log técnico sem dado sensível", () => {
  it("só contém identificadores e tempos", () => {
    const l = linhaLog({
      traceId: "tr-1",
      conversationId: "c1",
      etapa: "meta_api",
      durationMs: 6870,
      fluxo: "send",
    });
    expect(validarLinhaLog(l as any)).toBe(true);
    const texto = JSON.stringify(l);
    expect(texto).not.toContain("body");
    expect(texto).not.toContain("telefone");
    expect(texto).not.toContain("paciente");
  });

  it("rejeita campos proibidos", () => {
    expect(validarLinhaLog({ traceId: "x", body: "olá" })).toBe(false);
    expect(validarLinhaLog({ traceId: "x", telefone: "5581..." })).toBe(false);
  });
});

describe("baseline p50/p95/p99/máximo", () => {
  it("calcula percentis", () => {
    const v = [100, 200, 300, 400, 500, 600, 700, 800, 900, 1000];
    expect(percentil(v, 50)).toBe(500);
    expect(percentil(v, 95)).toBe(1000);
    expect(estatistica(v).max).toBe(1000);
    expect(estatistica([]).n).toBe(0);
  });

  it("agrega traces de envio", () => {
    const ag = criarAgregador();
    for (const meta of [1000, 2000, 9000]) {
      const t = criarTrace({ fluxo: "send" });
      t.marcar("SEND_T0_CLICK", 0);
      t.marcar("SEND_T1_OPTIMISTIC_RENDER", 10);
      t.marcar("SEND_T3_BACKEND_RECEIVED", 50);
      t.marcar("SEND_T6_META_REQUEST_START", 60);
      t.marcar("SEND_T7_META_RESPONSE", 60 + meta);
      t.marcar("SEND_T10_BACKEND_RESPONSE", 100 + meta);
      t.marcar("SEND_T12_CANONICAL_RECONCILED", 200 + meta);
      ag.registrarResumo(t.resumo());
    }
    const b = ag.baseline();
    expect(b.SEND_META?.n).toBe(3);
    expect(b.SEND_META?.p50).toBe(2000);
    expect(b.SEND_META?.max).toBe(9000);
    expect(b.SEND_TOTAL?.max).toBe(9200);
    expect(b.SEND_UI_RENDER?.p50).toBe(10);
  });
});
