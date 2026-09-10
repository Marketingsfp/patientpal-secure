/**
 * FASE 5 — HOMOLOGAÇÃO do Confidence Engine e da política de handoff.
 *
 * Cada caso parte da mensagem real do paciente, passa pela classificação do
 * turno, pelo motor (resposta e ação avaliadas em separado) e pela decisão de
 * recuperação/handoff. Nada aqui toca WhatsApp, produção ou banco.
 */
import { describe, expect, it } from "bun:test";
import { detectarIntencoes, intencaoAmbigua } from "../atendimento-fase1";
import { montarContextoCanonicoTurno } from "./contexto-turno";
import { decidirHandoff, POLITICA_RECUPERACAO_PADRAO } from "./handoff-decision";
import { decidirNoTurno, verificarRespostaFinalDoTurno, type EstadoDoTurno } from "./runtime";
import { linhasConfiabilidade, montarRegistroAuditoria } from "./auditoria";
import type { EtapaFluxoNina } from "../fluxo-estado-normalizar";

const deps = { detectarIntencoes, intencaoAmbigua };

type Cenario = {
  mensagem: string;
  resposta?: string;
  estado?: Partial<EstadoDoTurno>;
  stage?: EtapaFluxoNina;
  tentativas?: number;
  pedidoHumano?: boolean;
};

function homologar(c: Cenario) {
  const canonico = montarContextoCanonicoTurno(
    { mensagemPaciente: c.mensagem, podeAgendar: true, ...(c.stage ? { stage: c.stage } : {}) },
    deps,
  );
  const base: EstadoDoTurno = {
    texto: c.resposta ?? "",
    ferramentas: [],
    catalogoEncontrou: false,
    agendamentoConfirmado: false,
    pacienteIdentificado: false,
    esclarecimentoUsado: false,
    handoffSolicitado: false,
    intent: canonico.intent,
    acao: canonico.requestedAction,
    tipoTurno: canonico.turnType,
    mensagemPaciente: c.mensagem,
    intentAmbiguo: canonico.intentAmbiguo,
    ...c.estado,
  };
  const acao = decidirNoTurno(base);
  const resposta = verificarRespostaFinalDoTurno(base, base.texto ?? "");
  const plano = decidirHandoff({
    avaliacaoAcao: acao,
    decisaoEfetiva: acao.decision,
    tipoTurno: canonico.turnType,
    ...(c.pedidoHumano ? { pedidoHumanoExplicito: true } : {}),
    tentativasEsclarecimento: c.tentativas ?? 0,
  });
  return { canonico, acao, resposta, plano };
}

/** Status de um validador dentro do resultado, para checar aplicabilidade. */
function status(r: { validators?: { validator: string; status: string }[] }, nome: string) {
  return (r.validators ?? []).find((v) => v.validator === nome)?.status ?? "AUSENTE";
}

describe("CASO 1 — saudação real", () => {
  const { canonico, acao, resposta, plano } = homologar({
    mensagem: "oi",
    resposta: "Olá! Sou a Nina, da clínica. Como posso ajudar?",
  });

  it("é saudação e não pede ação nenhuma", () => {
    expect(canonico.turnType).toBe("SAUDACAO");
    expect(canonico.requestedAction).toBeNull();
  });

  it("fonte oficial e consulta ao sistema não se aplicam", () => {
    expect(status(resposta, "OfficialSourceValidator")).toBe("NOT_APPLICABLE");
    expect(status(resposta, "ToolIntegrityValidator")).toBe("NOT_APPLICABLE");
  });

  it("segurança da ação não se aplica", () => {
    expect(acao.actionSafety?.status).toBe("NOT_APPLICABLE");
  });

  it("confiança da resposta é alta e nada é transferido", () => {
    expect(resposta.level).toBe("HIGH");
    expect(resposta.hardBlockers ?? []).toHaveLength(0);
    expect(plano.decision).toBe("CONTINUE");
    expect(plano.reason).toBe("GREETING");
  });

  it("o painel não mostra nada como falha", () => {
    const registro = montarRegistroAuditoria(resposta, {
      turnType: canonico.turnType,
      acaoSolicitada: canonico.requestedAction,
    });
    const linhas = linhasConfiabilidade(registro);
    expect(linhas.some((l) => l.estado === "falha")).toBe(false);
    expect(linhas.some((l) => l.estado === "nao_aplicavel")).toBe(true);
  });
});

describe("CASO 2 — bom dia", () => {
  const { canonico, resposta, plano } = homologar({
    mensagem: "bom dia",
    resposta: "Bom dia! Como posso ajudar você hoje?",
  });

  it("segue o mesmo princípio da saudação", () => {
    expect(canonico.turnType).toBe("SAUDACAO");
    expect(canonico.requestedAction).toBeNull();
    expect(resposta.level).toBe("HIGH");
    expect(plano.decision).toBe("CONTINUE");
  });
});

describe("CASO 3 — intenção genérica", () => {
  const { canonico, resposta, plano } = homologar({
    mensagem: "queria uma informação",
    resposta: "Claro. Sobre qual consulta, exame ou procedimento você gostaria de saber?",
  });

  it("é esclarecimento, sem ação e sem erro de fonte", () => {
    expect(canonico.turnType).toBe("ESCLARECIMENTO");
    expect(canonico.requestedAction).toBeNull();
    expect(status(resposta, "OfficialSourceValidator")).toBe("NOT_APPLICABLE");
  });

  it("pergunta bem feita pode ter confiança alta e não transfere", () => {
    expect(resposta.level).toBe("HIGH");
    // Continuar ou perguntar: as duas mantêm o paciente com a Nina.
    expect(plano.decision === "CLARIFY" || plano.decision === "CONTINUE").toBe(true);
    expect(plano.decision).not.toBe("HANDOFF");
  });
});

describe("CASO 4 — agendamento incompleto", () => {
  const { canonico, acao, plano } = homologar({
    mensagem: "quero agendar",
    resposta: "Perfeito. Para qual especialidade ou exame seria?",
  });

  it("reconhece a intenção sem executar ação", () => {
    expect(canonico.intent).toContain("agendamento");
    expect(canonico.requestedAction).toBeNull();
    expect(acao.actionSafety?.status).not.toBe("ALLOWED");
  });

  it("a Nina segue o fluxo em vez de transferir", () => {
    expect(plano.decision === "CLARIFY" || plano.decision === "CONTINUE").toBe(true);
  });
});

describe("CASO 5 — pergunta factual", () => {
  const { canonico, resposta } = homologar({
    mensagem: "qual o valor da consulta de neurologista?",
    resposta: "A consulta de neurologia custa R$ 300,00.",
    estado: {
      catalogoEncontrou: true,
      ferramentas: [
        {
          nome: "buscar_catalogo",
          capacidade: "searchKnowledgeBase",
          fonte: "catalogo",
          success: true,
        },
      ],
    },
  });

  it("é informação e exige fonte oficial", () => {
    expect(canonico.turnType).toBe("INFORMACAO");
    expect(status(resposta, "OfficialSourceValidator")).not.toBe("NOT_APPLICABLE");
  });

  it("com o catálogo consultado, a resposta é liberada", () => {
    expect(resposta.hardBlockers ?? []).toHaveLength(0);
  });
});

describe("CASO 6 — fonte ausente", () => {
  const { resposta, acao, plano } = homologar({
    mensagem: "qual o valor da consulta de neurologista?",
    resposta: "A consulta de neurologia custa R$ 300,00.",
    estado: {
      catalogoEncontrou: false,
      ferramentas: [
        {
          nome: "buscar_catalogo",
          capacidade: "searchKnowledgeBase",
          fonte: "catalogo",
          success: true,
        },
      ],
    },
  });

  it("a resposta sem respaldo é barrada", () => {
    expect((resposta.hardBlockers ?? []).length).toBeGreaterThan(0);
    expect((acao.hardBlockers ?? []).length).toBeGreaterThan(0);
  });

  it("a política manda chamar atendente em vez de inventar", () => {
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.reason).toBe("MISSING_REQUIRED_SOURCE");
  });
});

describe("CASO 7 — ação crítica sem confirmação da agenda", () => {
  const { acao, resposta, plano } = homologar({
    mensagem: "quero agendar amanhã às 10h",
    resposta: "Vou confirmar sua vaga antes.",
    stage: "CREATING_APPOINTMENT",
    estado: { requiredFields: ["nome_completo", "data_nascimento"], entities: {} },
  });

  it("a ação fica bloqueada e não é executada", () => {
    expect(acao.actionSafety?.status).toBe("BLOCKED");
    expect(acao.decision).not.toBe("ALLOW");
  });

  it("a nota da resposta é avaliada por conta própria", () => {
    expect(typeof resposta.score).toBe("number");
    expect(resposta.score).not.toBe(acao.score);
  });

  it("o destino é perguntar, não transferir", () => {
    expect(plano.decision).toBe("BLOCK_ACTION");
    expect(plano.clarify).toBe(true);
  });
});

describe("CASO 8 — pedido de atendente", () => {
  const { canonico, plano } = homologar({
    mensagem: "quero falar com uma atendente",
    pedidoHumano: true,
  });

  it("transfere pela regra própria", () => {
    expect(canonico.turnType).toBe("HANDOFF");
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.reason).toBe("EXPLICIT_HUMAN_REQUEST");
  });
});

describe("CASO 9 — baixa confiança recuperável", () => {
  const { acao, plano } = homologar({
    mensagem: "preciso remarcar meu horário",
    resposta: "Consigo ajudar. Qual é o horário atual do seu agendamento?",
    stage: "CREATING_APPOINTMENT",
    estado: { requiredFields: ["data_atual_agendamento"], entities: {} },
  });

  it("a nota da ação é baixa, mas a Nina segue perguntando", () => {
    expect(acao.decision).not.toBe("ALLOW");
    expect(plano.decision === "CLARIFY" || plano.decision === "BLOCK_ACTION").toBe(true);
    expect(plano.recuperavel).toBe(true);
  });
});

describe("CASO 10 — baixa confiança irrecuperável", () => {
  const { plano } = homologar({
    mensagem: "confirma meu agendamento de amanhã às 10h",
    resposta: "Confirmado para amanhã às 10h.",
    stage: "CREATING_APPOINTMENT",
    tentativas: POLITICA_RECUPERACAO_PADRAO.maxTentativasEsclarecimento,
    estado: {
      ferramentas: [
        {
          nome: "criar_agendamento",
          capacidade: "createAppointment",
          fonte: "agenda",
          success: false,
          erro: "indisponível",
        },
      ],
    },
  });

  it("risco real e sem saída segura vira atendimento humano", () => {
    expect(plano.decision).toBe("HANDOFF");
    expect(plano.clarify).toBe(false);
  });
});

describe("GATE — regras transversais", () => {
  it("NOT_APPLICABLE não derruba a nota da saudação", () => {
    const { resposta } = homologar({ mensagem: "oi", resposta: "Olá! Como posso ajudar?" });
    expect(resposta.score).toBeGreaterThanOrEqual(90);
  });

  it("confiança baixa isolada não transfere", () => {
    const { canonico, acao } = homologar({ mensagem: "queria uma informação" });
    const plano = decidirHandoff({
      avaliacaoAcao: acao,
      decisaoEfetiva: "HANDOFF",
      tipoTurno: canonico.turnType,
    });
    expect(plano.decision).toBe("CLARIFY");
  });
});
