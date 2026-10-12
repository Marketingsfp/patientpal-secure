/**
 * FASE 4 — ESTADOS DE CONVERSA E FALHAS CONTROLADAS.
 *
 * Entrada ambígua gera PERGUNTA e espera. Nenhuma transferência acontece só
 * porque a Nina reavaliou a mesma mensagem antes de o paciente responder.
 * Handoff só é anunciado quando o serviço confirma; em falha, o rascunho
 * reprovado nunca vai ao paciente. Limite de rodadas tem desfecho próprio.
 */
import { describe, expect, it } from "bun:test";
import {
  abrirPendencia,
  blocoContratoEsclarecimento,
  fecharPendencia,
  normalizarPendencia,
  pendenciaVazia,
  perguntaParaPaciente,
  reavaliarPendencia,
} from "./esclarecimento";
import type { ResultadoConfianca } from "./types";

const RASCUNHO_REPROVADO = "A consulta custa R$ 250 e o Dr. Silva atende amanhã às 9h.";

function resultado(over: Partial<ResultadoConfianca> = {}): ResultadoConfianca {
  return {
    score: 42,
    level: "medium",
    decision: "CLARIFY",
    hardBlockers: [],
    validators: [
      {
        validator: "RequiredDataValidator",
        status: "FAIL",
        reasonCode: "MISSING_FIELD",
        weight: 1,
      },
    ],
    evidence: {
      categorias: [],
      motivos: ["falta o procedimento desejado"],
      camposFaltantes: ["o procedimento desejado"],
    },
    ...over,
  } as unknown as ResultadoConfianca;
}

// ---------------------------------------------------------------------------
// 1 — CLARIFY: pergunta curta, pendência persistida, turno encerrado
// ---------------------------------------------------------------------------
describe("CLARIFY produz pergunta e espera o paciente", () => {
  it("a pergunta é curta, é uma pergunta e não repete a afirmação reprovada", () => {
    const q = perguntaParaPaciente(resultado());
    expect(q.endsWith("?")).toBe(true);
    expect(q.length).toBeLessThan(160);
    expect(q).not.toContain("R$");
    expect(q).not.toContain("[SISTEMA]");
  });

  it("a pendência guarda o que falta, sem consumir tentativa ao ser emitida", () => {
    const p = abrirPendencia({
      resultado: resultado(),
      intent: "informacao",
      messageId: "m1",
      tentativasConsumidas: 0,
    });
    expect(p.pendente).toBe(true);
    expect(p.tentativas).toBe(0);
    expect(p.alvo).toContain("o procedimento desejado");
    expect(p.message_id).toBe("m1");
  });

  it("a pendência sobrevive à serialização do estado da conversa", () => {
    const p = abrirPendencia({
      resultado: resultado(),
      intent: "informacao",
      messageId: "m1",
      tentativasConsumidas: 1,
    });
    const voltou = normalizarPendencia(JSON.parse(JSON.stringify(p)));
    expect(voltou).toEqual(p);
  });
});

// ---------------------------------------------------------------------------
// 2 — pergunta emitida ≠ paciente respondeu sem resolver
// ---------------------------------------------------------------------------
describe("a tentativa só é consumida quando o paciente responde", () => {
  const pendente = abrirPendencia({
    resultado: resultado(),
    intent: "informacao",
    messageId: "m1",
    tentativasConsumidas: 0,
  });

  it("reavaliar a MESMA mensagem (reinício, lote, retomada) não consome tentativa", () => {
    const r = reavaliarPendencia({
      anterior: pendente,
      intentAtual: "informacao",
      messageIdAtual: "m1",
    });
    expect(r.tentativas).toBe(0);
    expect(r.pendencia.pendente).toBe(true);
  });

  it("nova mensagem do paciente no mesmo assunto consome uma tentativa", () => {
    const r = reavaliarPendencia({
      anterior: pendente,
      intentAtual: "informacao",
      messageIdAtual: "m2",
    });
    expect(r.tentativas).toBe(1);
  });

  it("mudar de assunto descarta a pergunta antiga em vez de prender o paciente", () => {
    const r = reavaliarPendencia({
      anterior: pendente,
      intentAtual: "agendamento",
      messageIdAtual: "m2",
    });
    expect(r.mudouDeAssunto).toBe(true);
    expect(r.pendencia).toEqual(pendenciaVazia());
    expect(r.tentativas).toBe(0);
  });

  it("resolvida a dúvida, a pendência é fechada", () => {
    expect(fecharPendencia().pendente).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3 — estado e restrições no contrato correto (nunca falso role:user)
// ---------------------------------------------------------------------------
describe("estado da conversa viaja no contrato de sistema", () => {
  it("o bloco descreve a pendência sem se passar por mensagem do paciente", () => {
    const bloco = blocoContratoEsclarecimento(
      abrirPendencia({
        resultado: resultado(),
        intent: "informacao",
        messageId: "m1",
        tentativasConsumidas: 1,
      }),
    );
    expect(bloco).toContain("ESCLARECIMENTO PENDENTE");
    expect(bloco).toContain("Perguntas já respondidas sem resolver: 1");
  });

  it("sem pendência não há bloco algum", () => {
    expect(blocoContratoEsclarecimento(pendenciaVazia())).toBeNull();
  });
});
