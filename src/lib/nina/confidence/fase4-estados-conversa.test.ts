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
import {
  TEXTO_HANDOFF_CONFIRMADO,
  TEXTO_HANDOFF_FALHOU,
  TEXTO_LIMITE_RODADAS,
  desfechoDeHandoff,
  desfechoLimiteRodadas,
} from "./desfecho";
import { decidirHandoff } from "./handoff-decision";
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

  it("nenhuma transferência ocorre pela reavaliação da mesma mensagem", () => {
    const r = reavaliarPendencia({
      anterior: { ...pendente, tentativas: 1 },
      intentAtual: "informacao",
      messageIdAtual: "m1",
    });
    const plano = decidirHandoff({
      avaliacaoAcao: resultado(),
      decisaoEfetiva: "CLARIFY",
      tipoTurno: "ESCLARECIMENTO",
      tentativasEsclarecimento: r.tentativas,
    });
    expect(plano.decision).toBe("CLARIFY");
  });

  it("depois de duas respostas sem avanço, aí sim a política transfere", () => {
    const plano = decidirHandoff({
      avaliacaoAcao: resultado(),
      decisaoEfetiva: "CLARIFY",
      tipoTurno: "ESCLARECIMENTO",
      tentativasEsclarecimento: 2,
    });
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.reason).toBe("REPEATED_CLARIFICATION_FAILURE");
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

// ---------------------------------------------------------------------------
// 4 — handoff confirmado, handoff falho e limite de rodadas
// ---------------------------------------------------------------------------
describe("desfechos verdadeiros da transferência", () => {
  it("transferência só é anunciada quando o serviço confirma", () => {
    const d = desfechoDeHandoff({ confirmado: true, motivo: "HANDOFF/EXPLICIT_HUMAN_REQUEST" });
    expect(d.estado).toBe("HANDOFF_CONFIRMADO");
    expect(d.resposta).toBe(TEXTO_HANDOFF_CONFIRMADO);
    expect(d.handoffConfirmado).toBe(true);
  });

  it("falha de transferência não anuncia atendente e não devolve o rascunho reprovado", () => {
    const d = desfechoDeHandoff({
      confirmado: false,
      motivo: "HANDOFF/MISSING_REQUIRED_SOURCE",
      erro: "conversa_nao_encontrada",
    });
    expect(d.estado).toBe("HANDOFF_FALHOU");
    expect(d.resposta).toBe(TEXTO_HANDOFF_FALHOU);
    expect(d.resposta).not.toContain(RASCUNHO_REPROVADO);
    expect(d.resposta).not.toContain("vou chamar uma atendente");
    expect(d.handoffConfirmado).toBe(false);
    expect(d.requerRetomadaHumana).toBe(true);
    expect(d.erro).toBe("conversa_nao_encontrada");
  });

  it("limite de rodadas tem desfecho próprio, sem reaproveitar rascunho", () => {
    const d = desfechoLimiteRodadas({ handoffConfirmado: false, rodadas: 6 });
    expect(d.estado).toBe("LIMITE_RODADAS");
    expect(d.resposta).toBe(TEXTO_LIMITE_RODADAS);
    expect(d.resposta).not.toContain(RASCUNHO_REPROVADO);
    expect(d.explicacao).toContain("6 rodadas");
  });

  it("limite de rodadas com transferência confirmada anuncia a atendente", () => {
    const d = desfechoLimiteRodadas({ handoffConfirmado: true, rodadas: 3 });
    expect(d.estado).toBe("HANDOFF_CONFIRMADO");
    expect(d.handoffConfirmado).toBe(true);
  });

  it("nenhum desfecho inventa gravação ou informação não confirmada", () => {
    for (const d of [
      desfechoDeHandoff({ confirmado: false, motivo: "x" }),
      desfechoLimiteRodadas({ handoffConfirmado: false, rodadas: 3 }),
    ]) {
      expect(d.resposta).not.toMatch(/agendei|agendado|marcado|confirmad[oa] (sua|seu)/i);
      expect(d.origem).toBe("codigo");
    }
  });
});
