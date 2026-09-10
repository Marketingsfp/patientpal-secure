/**
 * FASE 7 — GATE DE VALIDAÇÃO DO CONFIDENCE ENGINE v2.
 *
 * Camada pura (sem banco, sem rede, sem modelo). Executa os 10 casos
 * determinísticos exigidos antes de o motor virar gate de produção e devolve
 * PASS/FAIL por caso. Nada aqui altera resposta, envia mensagem ou grava dado:
 * é verificação de sistema, não julgamento de IA.
 *
 * Reutiliza os mecanismos já existentes (shadow.ts, etapas.ts,
 * etapas-flag.server.ts). Nenhuma flag paralela é criada.
 */
import { montarContextoDoTurno, decidirNoTurno, type EstadoDoTurno } from "./runtime";
import { assegurarAvaliacaoDoTextoFinal, verificarRespostaFinal } from "./final-answer";
import { aplicarModo, type ModoConfianca } from "./shadow";
import type { ResultadoConfianca } from "./types";

export type CasoGateV2 = {
  id: string;
  titulo: string;
  esperado: string;
  estado: Omit<EstadoDoTurno, "mensagemPaciente">;
  mensagem: string;
  /** Verificação determinística do que a Fase 7 exige deste caso. */
  verificar: (r: ResultadoConfianca) => boolean;
};

export type LinhaGateV2 = {
  id: string;
  titulo: string;
  esperado: string;
  score: number;
  nivel: ResultadoConfianca["level"];
  cobertura: number;
  decisao: ResultadoConfianca["decision"];
  bloqueadores: string[];
  /** Em shadow nada interfere; preservado para comparação. */
  decisaoEfetiva: ResultadoConfianca["decision"];
  interferiu: boolean;
  status: "PASS" | "FAIL";
};

const base = {
  ambiente: "homologacao" as const,
  catalogoEncontrou: false,
  agendamentoConfirmado: false,
  pacienteIdentificado: false,
  esclarecimentoUsado: false,
  handoffSolicitado: false,
};

const catalogoOk = {
  nome: "buscar_procedimentos",
  capacidade: "searchKnowledgeBase",
  fonte: "catalogo_publicado",
  success: true,
};
const agendaOk = {
  nome: "consultar_disponibilidade",
  capacidade: "checkAvailability",
  fonte: "agenda",
  success: true,
};
const fonteCatalogo = {
  tipo: "catalogo_publicado" as const,
  temConteudo: true,
  publicado: true,
  ativo: true,
};
const fonteAgenda = { tipo: "agenda" as const, temConteudo: true, publicado: true, ativo: true };

const naoEhAlta = (r: ResultadoConfianca) => r.level !== "HIGH" || r.decision !== "ALLOW";
const bloqueou = (r: ResultadoConfianca) =>
  r.decision === "BLOCK_ACTION" || r.decision === "HANDOFF" || (r.hardBlockers ?? []).length > 0;

export const CASOS_GATE_V2: CasoGateV2[] = [
  {
    id: "1-informativa-correta",
    titulo: "Pergunta informativa com resposta factual e fonte oficial",
    esperado: "Alta confiança",
    mensagem: "Vocês atendem cardiologia?",
    estado: {
      ...base,
      intent: "informacao",
      acao: "responder_informacao",
      texto: "Sim, atendemos cardiologia na unidade central.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
      retrievedSources: [fonteCatalogo],
    },
    verificar: (r) => r.level === "HIGH" && r.decision === "ALLOW",
  },
  {
    id: "2-falsa-falha-agendamento",
    titulo: "Pergunta informativa e Nina afirma falha de agendamento sem tool",
    esperado: "workflow mismatch e confiança baixa/bloqueio",
    mensagem: "Quais exames vocês fazem?",
    estado: {
      ...base,
      intent: "informacao",
      acao: "responder_informacao",
      texto: "Não consegui concluir seu agendamento. Pode tentar novamente?",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
      retrievedSources: [fonteCatalogo],
      estadoOperacional: {
        appointmentFlowActive: false,
        appointmentAttempted: false,
        appointmentToolCalled: false,
        appointmentCreated: false,
        workflowState: "INFO",
      },
    },
    verificar: (r) =>
      bloqueou(r) &&
      naoEhAlta(r) &&
      (r.hardBlockers ?? []).some(
        (b) => b === "WORKFLOW_STATE_MISMATCH" || b === "UNSUPPORTED_OPERATIONAL_CLAIM",
      ),
  },
  {
    id: "3-agendamento-sem-appointment-id",
    titulo: "Nina afirma agendamento concluído sem appointment_id",
    esperado: "Bloqueio crítico",
    mensagem: "Pode marcar quinta às 10h.",
    estado: {
      ...base,
      intent: "agendamento",
      acao: "criar_agendamento",
      texto: "Pronto, seu agendamento foi confirmado para quinta às 10h.",
      pacienteIdentificado: true,
      ferramentas: [agendaOk],
      retrievedSources: [fonteAgenda],
      estadoOperacional: {
        bookingIntentConfirmed: true,
        appointmentFlowActive: true,
        appointmentAttempted: true,
        appointmentToolCalled: false,
        appointmentCreated: false,
        appointmentId: null,
        workflowState: "SLOT_SELECTED",
      },
    },
    verificar: (r) => r.decision === "BLOCK_ACTION" && (r.hardBlockers ?? []).length > 0,
  },
  {
    id: "4-preco-sem-catalogo",
    titulo: "Preço informado sem catálogo publicado",
    esperado: "Bloqueio ou handoff",
    mensagem: "Quanto custa a ressonância?",
    estado: {
      ...base,
      intent: "preco",
      acao: "informar_valor",
      texto: "A ressonância custa R$ 900,00.",
      catalogoEncontrou: false,
      ferramentas: [],
      retrievedSources: [],
    },
    verificar: (r) => bloqueou(r) && naoEhAlta(r),
  },
  {
    id: "5-varios-fatos-com-evidencia",
    titulo: "Valor + profissional + horário + unidade, todos com evidência",
    esperado: "Sem penalidade por quantidade de fatos",
    mensagem: "Quanto custa a consulta e quem atende sábado?",
    estado: {
      ...base,
      intent: "informacao",
      acao: "responder_informacao",
      texto:
        "A consulta de cardiologia custa R$ 150,00, o Dr. João atende e há vaga sábado às 14h na unidade central.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk, agendaOk],
      retrievedSources: [fonteCatalogo, fonteAgenda],
      fatos: [
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "procedimento",
          campo: "preco",
          valor: "R$ 150,00",
          fonte: "catalogo_publicado",
          chave: { procedimento: "consulta de cardiologia" },
        },
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "profissional",
          campo: "nome",
          valor: "Dr. João",
          fonte: "catalogo_publicado",
        },
        {
          consulta: "consultar_disponibilidade",
          capacidade: "checkAvailability",
          entidade: "vaga",
          campo: "slot",
          valor: "sábado 14h",
          fonte: "agenda",
        },
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "unidade",
          campo: "nome",
          valor: "unidade central",
          fonte: "catalogo_publicado",
        },
      ],
      claims: [
        { tipo: "valor", texto: "consulta R$ 150,00", fonte: { tipo: "catalogo_publicado" } },
        { tipo: "profissional", texto: "Dr. João atende", fonte: { tipo: "catalogo_publicado" } },
        { tipo: "disponibilidade", texto: "sábado 14h", fonte: { tipo: "agenda" } },
      ],
    },
    verificar: (r) => r.decision === "ALLOW" && r.level === "HIGH",
  },
  {
    id: "6-claim-sem-fonte",
    titulo: "Quatro afirmações, três com fonte e uma sem",
    esperado: "Confiança reduzida ou bloqueio conforme criticidade",
    mensagem: "Quanto custa e tem vaga sábado?",
    estado: {
      ...base,
      intent: "informacao",
      acao: "responder_informacao",
      texto:
        "A consulta custa R$ 150,00, o Dr. João atende, o preparo é jejum de 6 horas e há vaga sábado às 14h.",
      catalogoEncontrou: true,
      ferramentas: [catalogoOk],
      retrievedSources: [fonteCatalogo],
      fatos: [
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "procedimento",
          campo: "preco",
          valor: "R$ 150,00",
          fonte: "catalogo_publicado",
          chave: { procedimento: "consulta de cardiologia" },
        },
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "profissional",
          campo: "nome",
          valor: "Dr. João",
          fonte: "catalogo_publicado",
        },
        {
          consulta: "consultar_disponibilidade",
          capacidade: "checkAvailability",
          entidade: "vaga",
          campo: "slot",
          valor: "sábado 14h",
          fonte: "agenda",
        },
        {
          consulta: "buscar_procedimentos",
          capacidade: "searchKnowledgeBase",
          entidade: "unidade",
          campo: "nome",
          valor: "unidade central",
          fonte: "catalogo_publicado",
        },
      ],
      claims: [
        { tipo: "valor", texto: "consulta R$ 150,00", fonte: { tipo: "catalogo_publicado" } },
        { tipo: "profissional", texto: "Dr. João atende", fonte: { tipo: "catalogo_publicado" } },
        { tipo: "preparo", texto: "jejum de 6 horas", fonte: { tipo: "catalogo_publicado" } },
        { tipo: "disponibilidade", texto: "vaga sábado às 14h", fonte: null },
      ],
    },
    verificar: (r) => naoEhAlta(r) || (r.claims?.semEvidencia?.length ?? 0) > 0,
  },
  {
    id: "7-intent-desconhecida",
    titulo: "Intenção desconhecida",
    esperado: "Nunca HIGH 100",
    mensagem: "?",
    estado: {
      ...base,
      intent: null,
      texto: "Claro, posso ajudar com isso.",
      catalogoEncontrou: false,
      ferramentas: [],
    },
    verificar: (r) => !(r.level === "HIGH" && r.score >= 100),
  },
  {
    id: "8-tudo-desconhecido",
    titulo: "Todos os validadores relevantes UNKNOWN/N-A",
    esperado: "Nunca 100%",
    mensagem: "oi",
    estado: {
      ...base,
      intent: null,
      texto: null,
      catalogoEncontrou: false,
      ferramentas: [],
    },
    verificar: (r) => r.score < 100,
  },
  {
    id: "10-handoff-nao-e-confianca",
    titulo: "Handoff solicitado",
    esperado: "Ação pode ser segura, mas answer confidence não vira 100",
    mensagem: "Quero falar com uma atendente.",
    estado: {
      ...base,
      intent: "handoff",
      acao: "transferir_humano",
      handoffSolicitado: true,
      texto: "Vou transferir você para nossa equipe.",
      ferramentas: [],
    },
    verificar: (r) => r.score < 100,
  },
];

export function executarCasoGateV2(c: CasoGateV2, modo: ModoConfianca = "shadow"): LinhaGateV2 {
  // O indicador da mensagem é answer_confidence (Fase 5): quando há texto
  // final, é ele que vale. Sem texto, avaliamos a segurança da ação.
  const estado: EstadoDoTurno = { ...c.estado, mensagemPaciente: c.mensagem };
  const texto = c.estado.texto ?? null;
  const r = texto
    ? verificarRespostaFinal({ ctx: montarContextoDoTurno(estado), textoFinal: texto })
    : decidirNoTurno(estado);
  const aplicado = aplicarModo(r, modo);
  return {
    id: c.id,
    titulo: c.titulo,
    esperado: c.esperado,
    score: r.score,
    nivel: r.level,
    cobertura: r.evidenceCoverage,
    decisao: r.decision,
    bloqueadores: (r.hardBlockers ?? []).slice(),
    decisaoEfetiva: aplicado.decisaoEfetiva,
    interferiu: aplicado.interferiu,
    status: c.verificar(r) ? "PASS" : "FAIL",
  };
}

/**
 * Caso 9 — texto avaliado A, texto enviado B. Verificação separada porque
 * depende do gate de saída (hash do texto final), não de um único turno.
 */
export function verificarCaso9TextoTrocado(): LinhaGateV2 {
  const estado: EstadoDoTurno = {
    ...base,
    intent: "informacao",
    acao: "responder_informacao",
    mensagemPaciente: "Vocês atendem cardiologia?",
    texto: "Sim, atendemos cardiologia.",
    catalogoEncontrou: true,
    ferramentas: [catalogoOk],
    retrievedSources: [fonteCatalogo],
  };
  const ctx = montarContextoDoTurno(estado);
  const textoA = "Sim, atendemos cardiologia.";
  const textoB = "Sim, atendemos cardiologia e o valor é R$ 150,00.";

  const avaliacaoA = assegurarAvaliacaoDoTextoFinal({ ctx, textoFinal: textoA }).resultado;
  const saidaB = assegurarAvaliacaoDoTextoFinal({
    ctx: { ...ctx, draftText: textoB },
    textoFinal: textoB,
    avaliacaoPrevia: avaliacaoA,
  });

  const ok =
    saidaB.recalculado &&
    saidaB.motivo === "texto_alterado_apos_avaliacao" &&
    saidaB.resultado.textoAvaliadoHash !== avaliacaoA.textoAvaliadoHash;

  const r = saidaB.resultado;
  return {
    id: "9-texto-avaliado-diferente-do-enviado",
    titulo: "Texto avaliado A e texto enviado B",
    esperado: "Score de A nunca associado a B",
    score: r.score,
    nivel: r.level,
    cobertura: r.evidenceCoverage,
    decisao: r.decision,
    bloqueadores: (r.hardBlockers ?? []).slice(),
    decisaoEfetiva: r.decision,
    interferiu: false,
    status: ok ? "PASS" : "FAIL",
  };
}

export function executarGateV2(modo: ModoConfianca = "shadow"): LinhaGateV2[] {
  const linhas = CASOS_GATE_V2.map((c) => executarCasoGateV2(c, modo));
  const caso9 = verificarCaso9TextoTrocado();
  // Mantém a ordem numérica dos casos do gate.
  return [...linhas.slice(0, 8), caso9, ...linhas.slice(8)];
}

export function resumoGateV2(linhas: LinhaGateV2[]) {
  return {
    total: linhas.length,
    pass: linhas.filter((l) => l.status === "PASS").length,
    fail: linhas.filter((l) => l.status === "FAIL").length,
    interferiu: linhas.filter((l) => l.interferiu).length,
  };
}

/* ------------------------------------------------------------------ *
 * COMPARAÇÃO SHADOW: motor antigo (v1) x motor novo (v2)
 * ------------------------------------------------------------------ */

export type SnapshotComparavel = {
  message_id?: string | null;
  outgoing_message_id?: string | null;
  execucao_id?: string | null;
  engine_version?: string | null;
  score?: number | null;
  nivel?: string | null;
  evidence_coverage?: number | null;
  resultado_final?: string | null;
  /** Erro reportado por uma pessoa para ESTA mensagem. */
  erro_reportado?: boolean;
  /** Erro confirmado após revisão humana. */
  erro_confirmado?: boolean;
};

export type ComparacaoShadow = {
  chave: string;
  scoreAntigo: number | null;
  scoreNovo: number | null;
  delta: number | null;
  coberturaAntiga: number | null;
  coberturaNova: number | null;
  decisaoAntiga: string | null;
  decisaoNova: string | null;
  mudouDecisao: boolean;
  erroReportado: boolean;
  erroConfirmado: boolean;
};

function chaveDoSnapshot(s: SnapshotComparavel): string | null {
  return (
    s.outgoing_message_id?.trim() ||
    s.message_id?.trim() ||
    s.execucao_id?.trim() ||
    null
  );
}

/** v2 = motor corrigido; qualquer outra versão (inclusive nula) é histórica. */
export function ehSnapshotV2(s: SnapshotComparavel, versaoV2: string): boolean {
  return (s.engine_version ?? "").trim() === versaoV2;
}

/**
 * Cruza snapshots antigos e novos da MESMA mensagem. Sem identificador exato
 * a linha é descartada: um snapshot não pode ser comparado por conversa.
 */
export function compararShadow(
  snapshots: SnapshotComparavel[],
  versaoV2: string,
): ComparacaoShadow[] {
  const antigos = new Map<string, SnapshotComparavel>();
  const novos = new Map<string, SnapshotComparavel>();
  for (const s of snapshots ?? []) {
    const chave = chaveDoSnapshot(s);
    if (!chave) continue;
    (ehSnapshotV2(s, versaoV2) ? novos : antigos).set(chave, s);
  }

  const linhas: ComparacaoShadow[] = [];
  for (const [chave, novo] of novos) {
    const antigo = antigos.get(chave) ?? null;
    const scoreAntigo = typeof antigo?.score === "number" ? antigo.score : null;
    const scoreNovo = typeof novo.score === "number" ? novo.score : null;
    linhas.push({
      chave,
      scoreAntigo,
      scoreNovo,
      delta: scoreAntigo !== null && scoreNovo !== null ? scoreNovo - scoreAntigo : null,
      coberturaAntiga: typeof antigo?.evidence_coverage === "number" ? antigo.evidence_coverage : null,
      coberturaNova: typeof novo.evidence_coverage === "number" ? novo.evidence_coverage : null,
      decisaoAntiga: antigo?.resultado_final ?? null,
      decisaoNova: novo.resultado_final ?? null,
      mudouDecisao: !!antigo && (antigo.resultado_final ?? null) !== (novo.resultado_final ?? null),
      erroReportado: !!(novo.erro_reportado || antigo?.erro_reportado),
      erroConfirmado: !!(novo.erro_confirmado || antigo?.erro_confirmado),
    });
  }
  return linhas;
}

export function resumoComparacaoShadow(linhas: ComparacaoShadow[]) {
  const comAmbos = linhas.filter((l) => l.delta !== null);
  const soma = comAmbos.reduce((a, l) => a + (l.delta ?? 0), 0);
  return {
    total: linhas.length,
    comparaveis: comAmbos.length,
    deltaMedio: comAmbos.length ? Math.round((soma / comAmbos.length) * 100) / 100 : null,
    decisoesAlteradas: linhas.filter((l) => l.mudouDecisao).length,
    errosReportados: linhas.filter((l) => l.erroReportado).length,
    errosConfirmados: linhas.filter((l) => l.erroConfirmado).length,
    /** Alta confiança nova que depois teve erro confirmado. */
    altaConfiancaComErro: linhas.filter(
      (l) => l.erroConfirmado && (l.scoreNovo ?? 0) >= 90,
    ).length,
  };
}

/* ------------------------------------------------------------------ *
 * ASSERTIONS DETERMINÍSTICAS PARA O TEST RUNNER
 * ------------------------------------------------------------------ */

export type SnapshotItemRunner = {
  score?: number | null;
  nivel?: string | null;
  evidence_coverage?: number | null;
  bloqueadores?: unknown;
  outgoing_message_id?: string | null;
  message_id?: string | null;
};

export type VerificacaoConfiancaRunner = {
  confidence_snapshot_present: boolean;
  confidence_linked_to_message: boolean;
  no_score_100_without_evidence: boolean;
  no_high_with_blocker: boolean;
};

function listaBloqueadores(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x)) : [];
}

/**
 * Verificações do SISTEMA sobre os snapshots reais persistidos no cenário.
 * Nada é recalculado: só conferimos invariantes do motor v2.
 */
export function verificarConfiancaRunner(
  snapshots: SnapshotItemRunner[],
): VerificacaoConfiancaRunner {
  const lista = snapshots ?? [];
  return {
    confidence_snapshot_present: lista.length > 0,
    confidence_linked_to_message: lista.every(
      (s) => !!(s.outgoing_message_id?.trim() || s.message_id?.trim()),
    ),
    no_score_100_without_evidence: lista.every(
      (s) => (s.score ?? 0) < 100 || (s.evidence_coverage ?? 0) >= 100,
    ),
    no_high_with_blocker: lista.every(
      (s) => String(s.nivel ?? "").toUpperCase() !== "HIGH" || listaBloqueadores(s.bloqueadores).length === 0,
    ),
  };
}

const ROTULOS_RUNNER: Record<keyof VerificacaoConfiancaRunner, { ok: string; falha: string }> = {
  confidence_snapshot_present: {
    ok: "Confiança avaliada e registrada.",
    falha: "Nenhuma avaliação de confiança foi registrada (mensagem ficaria 'Não avaliada').",
  },
  confidence_linked_to_message: {
    ok: "Cada avaliação está ligada à mensagem enviada.",
    falha: "Há avaliação sem vínculo com a mensagem enviada.",
  },
  no_score_100_without_evidence: {
    ok: "Nenhum score 100 sem cobertura total de evidências.",
    falha: "Houve score 100 sem cobertura total de evidências.",
  },
  no_high_with_blocker: {
    ok: "Nenhuma resposta de alta confiança com bloqueador ativo.",
    falha: "Houve alta confiança com bloqueador ativo.",
  },
};

export function criteriosDeConfianca(
  v: VerificacaoConfiancaRunner,
): Array<{ tipo: string; valor: string; ok: boolean; detalhe: string }> {
  return (Object.keys(ROTULOS_RUNNER) as (keyof VerificacaoConfiancaRunner)[]).map((chave) => ({
    tipo: "confianca",
    valor: chave,
    ok: v[chave],
    detalhe: v[chave] ? ROTULOS_RUNNER[chave].ok : ROTULOS_RUNNER[chave].falha,
  }));
}
