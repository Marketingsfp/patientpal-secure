/**
 * FASE 5 — o MESSAGE BATCH é UM turno do paciente.
 *
 * Prova determinística de que intenção, estágio, avaliação de confiança e
 * auditoria trabalham sobre o lote completo — nunca por fragmento.
 */
import { describe, expect, test } from "bun:test";
import { montarTurnoPaciente } from "@/lib/nina/burst";
import { detectarIntencoes, intencaoAmbigua } from "@/lib/nina/atendimento-fase1";
import {
  montarContextoCanonicoTurno,
  tamanhoDoLote,
} from "@/lib/nina/confidence/contexto-turno";
import { montarRegistroAuditoria } from "@/lib/nina/confidence/auditoria";
import type { ResultadoConfianca } from "@/lib/nina/confidence/types";

const deps = { detectarIntencoes, intencaoAmbigua };

const contextoDoLote = (mensagens: string[], ids: string[], batchId = "batch-1") =>
  montarContextoCanonicoTurno(
    {
      mensagemPaciente: montarTurnoPaciente(mensagens),
      podeAgendar: true,
      stage: null,
      messageIdEntrada: ids[0] ?? null,
      lote: { batchId, messageIds: ids, conversationRevision: 7 },
    },
    deps,
  );

describe("FASE 5 — batch = um turno lógico", () => {
  test('"Olá" + "Gostaria de marcar uma consulta" + "De neurologista" = 1 turno', () => {
    const c = contextoDoLote(
      ["Olá", "Gostaria de marcar uma consulta", "De neurologista"],
      ["m1", "m2", "m3"],
    );

    // 1 intenção do turno: agendamento (a saudação sozinha não vira turno).
    expect(c.intencoes).toContain("agendamento");
    expect(c.intentAmbiguo).toBe(false);
    // Intenção ≠ ação: sem o estágio de criação nada é executado.
    expect(c.requestedAction).toBeNull();
    // 1 transição lógica: o estágio vem do fluxo, não do número de mensagens.
    expect(c.stage).toBeNull();
    // Histórico físico preservado: 3 mensagens, 1 turno.
    expect(tamanhoDoLote(c)).toBe(3);
    expect(c.lote.messageIds).toEqual(["m1", "m2", "m3"]);
  });

  test('"Quero marcar" + "Cardiologista" + "Na sexta" — tudo visível antes de responder', () => {
    const mensagens = ["Quero marcar", "Cardiologista", "Na sexta"];
    const texto = montarTurnoPaciente(mensagens);
    // Cada mensagem continua distinta e na ordem original.
    expect(texto).toContain("1. Quero marcar");
    expect(texto).toContain("2. Cardiologista");
    expect(texto).toContain("3. Na sexta");

    const c = contextoDoLote(mensagens, ["a", "b", "c"]);
    expect(c.intencoes).toContain("agendamento");
    expect(tamanhoDoLote(c)).toBe(3);
  });

  test("fragmento isolado não decide o turno", () => {
    const soSaudacao = montarContextoCanonicoTurno(
      { mensagemPaciente: "Olá", podeAgendar: true },
      deps,
    );
    const loteCompleto = contextoDoLote(
      ["Olá", "Gostaria de marcar uma consulta", "De neurologista"],
      ["m1", "m2", "m3"],
    );
    // Só o lote fechado enxerga o pedido real.
    expect(soSaudacao.intencoes).not.toContain("agendamento");
    expect(loteCompleto.intencoes).toContain("agendamento");
  });

  test("mensagem única continua funcionando como turno de uma mensagem", () => {
    const c = montarContextoCanonicoTurno(
      { mensagemPaciente: "Quanto custa a consulta?", podeAgendar: true, messageIdEntrada: "x" },
      deps,
    );
    expect(tamanhoDoLote(c)).toBe(1);
    expect(c.lote.batchId).toBeNull();
  });
});

describe("FASE 5 — auditoria rastreia o lote", () => {
  const resultado: ResultadoConfianca = {
    score: 80,
    level: "HIGH",
    decision: "ALLOW",
    blockers: [],
    validators: [],
  } as unknown as ResultadoConfianca;

  test("registro guarda batchId, messageIds, revisão e execução", () => {
    const c = contextoDoLote(["Olá", "Quero marcar", "Neurologista"], ["m1", "m2", "m3"]);
    const reg = montarRegistroAuditoria(resultado, {
      conversationId: "conv-1",
      messageId: c.messageIdEntrada,
      batchId: c.lote.batchId,
      batchMessageIds: c.lote.messageIds,
      conversationRevision: c.lote.conversationRevision,
      executionId: "exec-1",
      intencao: c.intent,
      acaoSolicitada: c.requestedAction,
    });

    expect(reg.batchId).toBe("batch-1");
    expect(reg.batchMessageIds).toEqual(["m1", "m2", "m3"]);
    expect(reg.batchSize).toBe(3);
    expect(reg.conversationRevision).toBe(7);
    expect(reg.executionId).toBe("exec-1");
    // Pergunta respondível: quais mensagens originaram esta resposta?
    expect(reg.batchMessageIds).toContain("m2");
  });

  test("auditoria não guarda o texto das mensagens do lote", () => {
    const reg = montarRegistroAuditoria(resultado, {
      batchId: "b",
      batchMessageIds: ["m1"],
      executionId: "e",
    });
    expect(JSON.stringify(reg)).not.toContain("Neurologista");
  });

  test("sem lote informado, o registro cai na mensagem única", () => {
    const reg = montarRegistroAuditoria(resultado, { messageId: "m9" });
    expect(reg.batchId).toBeNull();
    expect(reg.batchMessageIds).toEqual(["m9"]);
    expect(reg.batchSize).toBe(1);
  });
});
