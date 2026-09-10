/**
 * FASE 1 — BASELINE DE SUPERCONFIANÇA DO CONFIDENCE DECISION ENGINE.
 *
 * Estes testes NÃO descrevem o comportamento desejado. Eles congelam o
 * comportamento ATUAL do motor, incluindo os defeitos, para que a fase de
 * correção tenha uma linha de base verificável e para que nenhuma mudança
 * futura passe despercebida.
 *
 * Cada bloco aponta o caminho de código envolvido. Nada aqui altera o motor.
 */
import { describe, expect, it } from "bun:test";
import { decidirConfianca } from "./engine";
import { decidirNoTurno, garantirScoreDoTextoEnviado, montarContextoDoTurno, verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";
import { avaliacaoCorrespondeAoTexto } from "./hash";
import { medirEvidencia, pontuarValidadores, POLITICA_PADRAO } from "./policy";
import { IntentClarityValidator, ToolIntegrityValidator } from "./validators";
import type { ContextoConfianca, ResultadoValidador } from "./types";

function estado(over: Partial<EstadoDoTurno> = {}): EstadoDoTurno {
  return {
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    ambiente: "homologacao",
    ...over,
  };
}

// ---------------------------------------------------------------------------
// TESTE 1 — nenhum sinal suficiente vira 100%
// Caminho: policy.ts:110 `if (total === 0) return 100;`
// ---------------------------------------------------------------------------
describe("BASELINE 1 — ausência de sinal é tratada como certeza", () => {
  it("CORRIGIDO NA FASE 3 — nenhuma dimensão avaliável não vale mais 100", () => {
    const todosNA: ResultadoValidador[] = [
      "IntentClarityValidator",
      "EntityResolutionValidator",
      "RequiredDataValidator",
      "OfficialSourceValidator",
      "SourceFreshnessValidator",
      "ToolIntegrityValidator",
      "ConflictValidator",
      "BusinessRulesValidator",
    ].map((validator) => ({
      validator,
      status: "NOT_APPLICABLE" as const,
      score: 100,
      reasonCode: "NAO_SE_APLICA",
      evidence: {},
    }));

    // ANTES (v1): denominador zero -> `if (total === 0) return 100`.
    // AGORA (v2): nada avaliável -> nota 0 e `semEvidencia`, nunca certeza.
    expect(pontuarValidadores(todosNA, POLITICA_PADRAO)).toBe(0);
    const medida = medirEvidencia(todosNA, POLITICA_PADRAO);
    expect(medida.semEvidencia).toBe(true);
    expect(medida.score).toBe(0);
  });

  it("um único validador aplicável já define sozinho os 100 do turno", () => {
    const soIntent: ResultadoValidador[] = [
      {
        validator: "IntentClarityValidator",
        status: "PASS",
        score: 100,
        reasonCode: "INTENCAO_CLARA",
        evidence: {},
      },
      {
        validator: "OfficialSourceValidator",
        status: "NOT_APPLICABLE",
        score: 100,
        reasonCode: "SEM_AFIRMACAO_OFICIAL",
        evidence: {},
      },
    ];
    // 15 de peso mandando em 100% da nota: os outros 85 saíram do denominador.
    expect(pontuarValidadores(soIntent, POLITICA_PADRAO)).toBe(100);
  });

  it("sem ação e sem ferramenta, o motor ainda pontua 40 (único freio existente)", () => {
    const r = decidirNoTurno(
      estado({ texto: "Sim, é isso mesmo.", acao: "desconhecida", intent: null }),
    );
    // IntentClarityValidator FAIL/ACAO_NAO_DEFINIDA é o único validador
    // aplicável: ele sozinho define a nota do turno inteiro.
    expect(r.score).toBe(40);
    expect(r.evidence.ferramentasExecutadas).toBe(0);
  });

  it("CORRIGIDO NA FASE 2 — ferramenta técnica não faz mais o turno virar 100", () => {
    const r = decidirNoTurno(
      estado({
        texto: "Sim, é isso mesmo.",
        acao: "desconhecida",
        intent: null,
        ferramentas: [
          { nome: "buscar_medicos", capacidade: "listProfessionals", fonte: "agenda", success: true },
        ],
      }),
    );
    // ANTES: IntentClarity virava NOT_APPLICABLE, todos os validadores saíam do
    // denominador e o `if (total === 0) return 100` assumia -> 100/HIGH/ALLOW.
    // AGORA: ação desconhecida permanece no denominador como WARNING.
    expect(r.score).toBeLessThan(100);
    expect(r.decision).not.toBe("ALLOW");
    expect(r.evidence.fontesUteis).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TESTE 2 — intenção ausente vira intenção clara
// Caminho: runtime.ts:80 `requestedAction: e.acao ?? "responder_informacao"`
//          validators.ts:111-114 (IntentClarityValidator)
// ---------------------------------------------------------------------------
describe("BASELINE 2 — intenção ausente é convertida em intenção observada", () => {
  it("CORRIGIDO NA FASE 2 — ação ausente vira desconhecida, não responder_informacao", () => {
    const ctx = montarContextoDoTurno(estado({ intent: null }));
    expect(ctx.intent).toBeNull();
    expect(ctx.requestedAction).toBe("desconhecida");
  });

  it("CORRIGIDO NA FASE 2 — sem intenção real não existe mais PASS/100/INTENCAO_CLARA", () => {
    const ctx = montarContextoDoTurno(estado({ intent: null }));
    const v = IntentClarityValidator(ctx);
    expect(v.status).toBe("FAIL");
    expect(v.reasonCode).toBe("ACAO_NAO_DEFINIDA");
    expect(v.score).toBeLessThan(100);
  });

  it("CORRIGIDO NA FASE 2 — ferramenta não tira a intenção do denominador", () => {
    const semTool = IntentClarityValidator(
      montarContextoDoTurno(estado({ intent: null, acao: "desconhecida" })),
    );
    expect(semTool.status).toBe("FAIL");
    expect(semTool.reasonCode).toBe("ACAO_NAO_DEFINIDA");

    // ANTES: NOT_APPLICABLE/100 (a dimensão "entendi o pedido" deixava de contar).
    // AGORA: WARNING, ainda pesando na nota do turno.
    const comTool = IntentClarityValidator(
      montarContextoDoTurno(
        estado({
          intent: null,
          acao: "desconhecida",
          ferramentas: [
            { nome: "buscar_medicos", capacidade: "listProfessionals", fonte: "agenda", success: true },
          ],
        }),
      ),
    );
    expect(comTool.status).toBe("WARNING");
    expect(comTool.reasonCode).toBe("ACAO_NAO_DEFINIDA");
    expect(comTool.score).toBeLessThan(100);
  });
});

// ---------------------------------------------------------------------------
// TESTE 3 — falso fluxo de agendamento (caso real de 08/09/2026)
// Caminho: whatsapp.server.ts:1419-1421 substitui o texto; o motor avalia
//          o turno sem qualquer sinal de tentativa de agendamento.
// ---------------------------------------------------------------------------
describe("BASELINE 3 — mensagem de falha de agendamento sem tentativa de agendamento", () => {
  const turno = estado({
    texto: "Não consegui concluir seu agendamento neste momento. Vou verificar novamente.",
    acao: "responder_informacao",
    intent: "informacao",
    mensagemPaciente: "Quais os dias e horários e o valor em dinheiro e no cartão?",
    ferramentas: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
      },
    ],
    catalogoEncontrou: true,
    agendamentoConfirmado: false,
  });

  it("o motor não recebe nenhum sinal de tentativa de agendamento", () => {
    const ctx = montarContextoDoTurno(turno);
    // Não existe campo de tentativa: nem appointmentAttempted, nem agenda.
    expect(Object.keys(ctx)).not.toContain("appointmentAttempted");
    expect(ctx.businessContext.agendamentoConfirmado).toBe(false);
    expect(ctx.toolResults.some((f) => f.capacidade === "createAppointment")).toBe(false);
    expect(ctx.toolResults.some((f) => f.capacidade === "checkAvailability")).toBe(false);
  });

  it("comportamento atual: o turno não é reprovado por afirmar falha operacional", () => {
    const r = decidirNoTurno(turno);
    // Congela o resultado atual, seja qual for o nível: o ponto é que nenhum
    // validador olha para a contradição "afirmo falha sem ter tentado".
    expect(["ALLOW", "CLARIFY", "HANDOFF", "BLOCK_ACTION"]).toContain(r.decision);
    expect(r.blockers).not.toContain("AGENDA_SEM_CONFIRMACAO");
    expect(r.evidence.motivos.join(" ")).not.toContain("tentativa");
  });

  it("CORRIGIDO NA FASE 4 — falha inventada NÃO recebe a mesma nota da resposta certa", () => {
    const comFalha = decidirNoTurno({
      ...turno,
      estadoOperacional: {
        appointmentFlowActive: false,
        bookingIntentConfirmed: false,
        appointmentAttempted: false,
        appointmentToolCalled: false,
        appointmentCreated: false,
        workflowState: "INFORMATION_RESPONSE",
      },
    });
    const informativo = decidirNoTurno({
      ...turno,
      texto: "O atendimento é por ordem de chegada, das 8h às 11h.",
    });
    expect(comFalha.score).toBeLessThan(informativo.score);
    expect(comFalha.hardBlockers).toContain("WORKFLOW_STATE_MISMATCH");
  });
});

// ---------------------------------------------------------------------------
// TESTE 4 — resposta alterada depois da avaliação
// Caminho: o motor avalia ctx.draftText; whatsapp.server.ts pode substituir
//          `resposta` depois, sem reavaliar.
// ---------------------------------------------------------------------------
describe("BASELINE 4 — a confiança fica presa ao texto avaliado, não ao enviado", () => {
  const base = estado({
    acao: "responder_informacao",
    intent: "informacao",
    ferramentas: [
      {
        nome: "consultar_base_conhecimento",
        capacidade: "searchKnowledgeBase",
        fonte: "catalogo_publicado",
        success: true,
      },
    ],
    catalogoEncontrou: true,
  });

  it("FASE 5 — score de um texto nunca é reaproveitado para outro texto", () => {
    const textoA = "O atendimento do cardiologista é por ordem de chegada.";
    const textoB = "A consulta custa R$ 250,00 e já está agendada para segunda.";

    const avaliadoA = decidirNoTurno({ ...base, texto: textoA });
    // A decisão da AÇÃO não é a nota da mensagem: sem amarra textual.
    expect(avaliadoA.tipoAvaliacao).toBe("action_safety");
    expect(avaliadoA.textoAvaliadoHash ?? null).toBeNull();

    // O gate de saída percebe que a mensagem entregue é outra e reavalia.
    const gate = garantirScoreDoTextoEnviado({ ...base, texto: textoB }, textoB, avaliadoA);
    expect(gate.recalculado).toBe(true);
    expect(gate.motivo).toBe("texto_alterado_apos_avaliacao");
    expect(avaliacaoCorrespondeAoTexto(gate.resultado.textoAvaliadoHash, textoB)).toBe(true);

    // Reapresentar o MESMO texto reaproveita a avaliação, sem recalcular.
    const outra = garantirScoreDoTextoEnviado({ ...base, texto: textoB }, textoB, gate.resultado);
    expect(outra.recalculado).toBe(false);
    expect(outra.resultado.score).toBe(gate.resultado.score);
  });

  it("FASE 5 — a avaliação da resposta final fica amarrada ao texto enviado", () => {
    const r = verificarRespostaFinalDoTurno({ ...base }, "texto final entregue ao paciente");
    expect(r.tipoAvaliacao).toBe("answer_confidence");
    expect(r.textoAvaliadoHash).toBeTruthy();
    expect(avaliacaoCorrespondeAoTexto(r.textoAvaliadoHash, "texto final entregue ao paciente")).toBe(true);
    // Qualquer alteração posterior invalida o score.
    expect(avaliacaoCorrespondeAoTexto(r.textoAvaliadoHash, "texto final entregue ao paciente!")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// TESTE 5 — handoff curto-circuita o motor
// Caminho: engine.ts:279-290 (return antecipado com score 100 / HIGH / ALLOW)
// ---------------------------------------------------------------------------
describe("BASELINE 5 — handoffSolicitado (corrigido na Fase 4)", () => {
  it("um turno que seria bloqueado passa a 100 quando handoffSolicitado = true", () => {
    const semHandoff = decidirNoTurno(
      estado({
        texto: "A ultrassonografia custa R$ 180,00.",
        acao: "informar_valor",
        intent: "preco",
        catalogoEncontrou: false,
      }),
    );
    expect(semHandoff.score).toBeLessThan(100);

    const comHandoff = decidirNoTurno(
      estado({
        texto: "A ultrassonografia custa R$ 180,00.",
        acao: "informar_valor",
        intent: "preco",
        catalogoEncontrou: false,
        handoffSolicitado: true,
      }),
    );
    // CORRIGIDO NA FASE 4: handoff não zera mais a avaliação. O bloqueio de
    // fonte continua visível — a nota reflete o texto, não o atalho.
    expect(comHandoff.score).toBeLessThan(100);
    expect(comHandoff.blockers).toContain("VALOR_SEM_CATALOGO");
  });

  it("DOCUMENTAÇÃO: esse 100 é segurança da AÇÃO de transferir, não confiabilidade do TEXTO", () => {
    const r = decidirNoTurno(
      estado({
        texto: "Valor inventado sem catálogo: R$ 999,00.",
        acao: "informar_valor",
        handoffSolicitado: true,
      }),
    );
    // CORRIGIDO NA FASE 4: o texto sem fonte oficial aparece na decisão.
    expect(r.score).toBeLessThan(100);
    expect(r.blockers).toContain("VALOR_SEM_CATALOGO");
    expect(r.evidence.fontesUteis).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TESTE 6 — ferramenta executou mas não comprovou o fato
// Caminho: runtime.ts:70-73 (temConteudo = success && !erro fora do catálogo)
//          validators.ts:258-278 (ToolIntegrityValidator)
// ---------------------------------------------------------------------------
describe("BASELINE 6 — sucesso técnico da ferramenta é tratado como prova do fato", () => {
  it("ferramenta fora do catálogo recebe temConteudo = true só por não ter falhado", () => {
    const ctx = montarContextoDoTurno(
      estado({
        texto: "O Dr. Fulano atende às quartas, das 14h às 17h.",
        acao: "informar_horario",
        ferramentas: [
          {
            nome: "buscar_medicos",
            capacidade: "listProfessionals",
            fonte: "agenda",
            success: true,
            // sem erro e sem nenhum registro retornado
          },
        ],
        catalogoEncontrou: false,
      }),
    );
    // O runtime não sabe se veio registro: assume que veio.
    expect(ctx.toolResults[0]?.temConteudo).toBe(true);

    const v = ToolIntegrityValidator(ctx);
    expect(v.status).toBe("PASS");
    expect(v.reasonCode).toBe("FERRAMENTAS_INTEGRAS");
  });

  it("consulta ao catálogo sem registro é WARNING, não bloqueio de integridade", () => {
    const ctx: ContextoConfianca = montarContextoDoTurno(
      estado({
        // FASE 2 — texto afirmativo: negativa apoiada em consulta vazia agora
        // é PASS legítimo, então o WARNING é testado com uma afirmação.
        texto: "Esse exame é feito na unidade central.",
        acao: "responder_informacao",
        ferramentas: [
          {
            nome: "consultar_base_conhecimento",
            capacidade: "searchKnowledgeBase",
            fonte: "catalogo_publicado",
            success: true,
          },
        ],
        catalogoEncontrou: false,
      }),
    );
    expect(ctx.toolResults[0]?.temConteudo).toBe(false);
    const v = ToolIntegrityValidator(ctx);
    expect(v.status).toBe("WARNING");
    expect(v.reasonCode).toBe("RETORNO_VAZIO");
  });

  it("no motor completo, a ferramenta vazia não impede uma nota alta", () => {
    const r = decidirConfianca(
      montarContextoDoTurno(
        estado({
          texto: "Pode ficar tranquilo, está tudo certo.",
          acao: "responder_informacao",
          intent: "informacao",
          ferramentas: [
            {
              nome: "buscar_medicos",
              capacidade: "listProfessionals",
              fonte: "agenda",
              success: true,
            },
          ],
        }),
      ),
    );
    expect(r.score).toBe(100);
    expect(r.level).toBe("HIGH");
  });
});
