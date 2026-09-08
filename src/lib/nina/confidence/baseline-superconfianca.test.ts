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
import { decidirNoTurno, montarContextoDoTurno, type EstadoDoTurno } from "./runtime";
import { pontuarValidadores, POLITICA_PADRAO } from "./policy";
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
  it("pontuarValidadores devolve 100 quando TODOS os validadores são NOT_APPLICABLE", () => {
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

    // Denominador zero. Nenhuma dimensão foi realmente verificada e ainda
    // assim o motor devolve confiança máxima.
    expect(pontuarValidadores(todosNA, POLITICA_PADRAO)).toBe(100);
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

  it("turno inteiro sem evidência nenhuma sai como HIGH/ALLOW", () => {
    const r = decidirNoTurno(
      estado({
        texto: "Sim, é isso mesmo.",
        acao: "desconhecida",
        intent: null,
      }),
    );
    expect(r.score).toBe(100);
    expect(r.level).toBe("HIGH");
    expect(r.decision).toBe("ALLOW");
    // Nenhuma ferramenta rodou, nenhuma fonte foi lida.
    expect(r.evidence.ferramentasExecutadas).toBe(0);
    expect(r.evidence.fontesUteis).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// TESTE 2 — intenção ausente vira intenção clara
// Caminho: runtime.ts:80 `requestedAction: e.acao ?? "responder_informacao"`
//          validators.ts:111-114 (IntentClarityValidator)
// ---------------------------------------------------------------------------
describe("BASELINE 2 — intenção ausente é convertida em intenção observada", () => {
  it("runtime substitui ação ausente por responder_informacao", () => {
    const ctx = montarContextoDoTurno(estado({ intent: null }));
    expect(ctx.intent).toBeNull();
    // A ausência de ação vira um valor concreto antes de o motor ver o turno.
    expect(ctx.requestedAction).toBe("responder_informacao");
  });

  it("IntentClarityValidator devolve PASS/100/INTENCAO_CLARA sem intenção real", () => {
    const ctx = montarContextoDoTurno(estado({ intent: null }));
    const v = IntentClarityValidator(ctx);
    expect(v.status).toBe("PASS");
    expect(v.score).toBe(100);
    expect(v.reasonCode).toBe("INTENCAO_CLARA");
    // A evidência registra a ação inventada pelo runtime, não uma intenção.
    expect(v.evidence["intent"]).toBe("responder_informacao");
  });

  it("o caminho NOT_APPLICABLE/SEM_INTENCAO_DECLARADA é inalcançável pelo runtime", () => {
    // Só se chega nele passando acao = "desconhecida" explicitamente.
    const direto = IntentClarityValidator(
      montarContextoDoTurno(estado({ intent: null, acao: "desconhecida" })),
    );
    expect(direto.reasonCode).toBe("SEM_INTENCAO_DECLARADA");
    expect(direto.status).toBe("NOT_APPLICABLE");
    // …e mesmo NOT_APPLICABLE mantém score 100 e sai do denominador.
    expect(direto.score).toBe(100);
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

  it("o mesmo turno com texto informativo correto recebe a MESMA avaliação", () => {
    const comFalha = decidirNoTurno(turno);
    const informativo = decidirNoTurno({
      ...turno,
      texto: "O atendimento é por ordem de chegada, das 8h às 11h.",
    });
    // O motor não distingue a resposta certa da mensagem de falha inventada.
    expect(informativo.score).toBe(comFalha.score);
    expect(informativo.level).toBe(comFalha.level);
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

  it("texto A avaliado e texto B enviado produzem decisões diferentes — e ninguém reavalia", () => {
    const textoA = "O atendimento do cardiologista é por ordem de chegada.";
    const textoB = "A consulta custa R$ 250,00 e já está agendada para segunda.";

    const avaliadoA = decidirNoTurno({ ...base, texto: textoA });
    const seFosseB = decidirNoTurno({ ...base, texto: textoB });

    // A avaliação de A não descreve B: categorias e/ou nota divergem.
    const diferente =
      avaliadoA.score !== seFosseB.score ||
      avaliadoA.decision !== seFosseB.decision ||
      JSON.stringify(avaliadoA.evidence.categorias) !==
        JSON.stringify(seFosseB.evidence.categorias);
    expect(diferente).toBe(true);

    // O resultado guardado não carrega o texto avaliado: não há como o
    // pipeline detectar que a mensagem enviada mudou depois da decisão.
    expect(Object.keys(avaliadoA)).not.toContain("draftTextHash");
    expect(Object.keys(avaliadoA)).not.toContain("textoAvaliado");
  });

  it("o resultado do motor não expõe nenhuma amarra com o texto avaliado", () => {
    const r = decidirNoTurno({ ...base, texto: "qualquer coisa" });
    const chaves = Object.keys(r);
    expect(chaves).toEqual(
      expect.arrayContaining(["score", "level", "decision", "blockers", "checks", "validators", "evidence"]),
    );
    expect(chaves.some((k) => k.toLowerCase().includes("texto") || k.toLowerCase().includes("draft"))).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// TESTE 5 — handoff curto-circuita o motor
// Caminho: engine.ts:279-290 (return antecipado com score 100 / HIGH / ALLOW)
// ---------------------------------------------------------------------------
describe("BASELINE 5 — handoffSolicitado devolve 100/HIGH/ALLOW sem avaliar nada", () => {
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
    expect(comHandoff.score).toBe(100);
    expect(comHandoff.level).toBe("HIGH");
    expect(comHandoff.decision).toBe("ALLOW");
    expect(comHandoff.blockers).toEqual([]);
    expect(comHandoff.hardBlockers).toEqual([]);
  });

  it("DOCUMENTAÇÃO: esse 100 é segurança da AÇÃO de transferir, não confiabilidade do TEXTO", () => {
    const r = decidirNoTurno(
      estado({
        texto: "Valor inventado sem catálogo: R$ 999,00.",
        acao: "informar_valor",
        handoffSolicitado: true,
      }),
    );
    // O texto continua sem fonte oficial, mas nada disso aparece na decisão.
    expect(r.score).toBe(100);
    expect(r.evidence.motivos).toContain("handoff já solicitado pelo runtime");
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
        texto: "Não temos esse exame.",
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
