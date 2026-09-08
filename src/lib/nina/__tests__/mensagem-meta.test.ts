/** FASE 1 — paridade da estrutura de metadados das mensagens da Nina. */
import { describe, expect, it } from "bun:test";
import {
  classificarAmbienteMensagem,
  execucoesDasRespostasNina,
  montarMetadadosMensagemNina,
} from "../mensagem-meta";

describe("ambiente da mensagem", () => {
  it("separa produção, homologação e teste automatizado", () => {
    expect(classificarAmbienteMensagem({ isTeste: false })).toBe("production");
    expect(classificarAmbienteMensagem({ isTeste: true })).toBe("homologation");
    expect(classificarAmbienteMensagem({ isTeste: true, execucaoAutomatizada: true })).toBe(
      "automated_test",
    );
  });
});

describe("metadados internos", () => {
  it("produção usa conversation_id e nunca test_conversation_id", () => {
    const m = montarMetadadosMensagemNina({
      messageId: "m1",
      conversaId: "c1",
      isTeste: false,
      criadaEm: "2026-09-08T00:00:00.000Z",
      execucaoId: "e1",
      confianca: { score: 94, nivel: "HIGH" },
    });
    expect(m.conversation_id).toBe("c1");
    expect(m.test_conversation_id).toBeNull();
    expect(m.environment).toBe("production");
    expect(m.confidence_score).toBe(94);
    expect(m.audit_trace_id).toBe("e1");
  });

  it("homologação usa test_conversation_id, ciclo e sessão", () => {
    const m = montarMetadadosMensagemNina({
      messageId: "m2",
      conversaId: "ct1",
      isTeste: true,
      cicloId: "ciclo-1",
      ninaSessionId: "sess-1",
    });
    expect(m.conversation_id).toBeNull();
    expect(m.test_conversation_id).toBe("ct1");
    expect(m.cycle_id).toBe("ciclo-1");
    expect(m.nina_session_id).toBe("sess-1");
  });

  it("não inventa confiança, reporte nem horários ausentes", () => {
    const m = montarMetadadosMensagemNina({ messageId: "m3", isTeste: true });
    expect(m.confidence_score).toBeNull();
    expect(m.confidence_level).toBeNull();
    expect(m.report_status).toBeNull();
    expect(m.created_at).toBeNull();
    expect(m.sent_at).toBeNull();
    expect(m.audit_trace_id).toBeNull();
  });

  it("registra reporte posterior quando existe", () => {
    const m = montarMetadadosMensagemNina({
      messageId: "m4",
      isTeste: false,
      conversaId: "c1",
      reporte: { status: "aberto", categoria: "valor", em: "2026-09-07T18:42:00.000Z" },
    });
    expect(m.report_status).toBe("aberto");
    expect(m.report?.categoria).toBe("valor");
  });
});

describe("lote de execuções", () => {
  it("pega só respostas da Nina, deduplicadas", () => {
    const ids = execucoesDasRespostasNina([
      { direction: "in", enviada_por: null, execucao_id: null },
      { direction: "out", enviada_por: "nina", execucao_id: "e1" },
      { direction: "out", enviada_por: "nina", execucao_id: "e1" },
      { direction: "out", enviada_por: "atendente", execucao_id: "e9" },
      { direction: "out", enviada_por: "nina", execucao_id: "e2" },
    ]);
    expect(ids).toEqual(["e1", "e2"]);
  });
});
