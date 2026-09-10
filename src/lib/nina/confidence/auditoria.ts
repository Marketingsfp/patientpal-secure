/**
 * FASE 5 — Auditoria e explicabilidade do Confidence Decision Engine.
 *
 * Camada pura: transforma a decisão do motor em um registro auditável e em
 * linhas legíveis para o painel interno.
 *
 * REGRA DURA: aqui só entra evidência observável (validador, status, código de
 * motivo, fonte, ferramenta, bloqueio). Nada de rascunho de resposta, prompt,
 * histórico da conversa ou raciocínio interno do modelo. O saneamento abaixo
 * remove qualquer campo de texto livre que escape por engano.
 */
import type {
  AcaoSolicitada,
  DecisaoMotor,
  NivelConfianca,
  ResultadoConfianca,
  StatusValidador,
} from "./types";

export type ResultadoFinalAuditoria =
  | "resposta_liberada"
  | "pergunta_de_esclarecimento"
  | "transferido_para_humano"
  | "acao_bloqueada";

/** Um campo com valores divergentes, preservado para auditoria técnica. */
export type ConflitoAuditado = {
  campo: string;
  origens: Array<{ origem: string; valor: string }>;
};

export type ValidadorAuditado = {
  validator: string;
  status: StatusValidador;
  reasonCode: string;
  evidence: Record<string, string | number | boolean>;
  /** FASE 6 — evidência estruturada de conflito (campo, origem A/B, valores). */
  conflitos: ConflitoAuditado[];
};

export type FerramentaAuditada = {
  nome: string;
  capacidade: string | null;
  fonte: string | null;
  sucesso: boolean;
  erro: string | null;
};

export type FonteAuditada = {
  tipo: string;
  referencia: string | null;
  publicado: boolean | null;
  temConteudo: boolean;
};

export type RegistroAuditoriaConfianca = {
  conversationId: string | null;
  messageId: string | null;
  /** FASE 6 — mensagem da Nina efetivamente enviada (vínculo principal). */
  outgoingMessageId: string | null;
  /** Sessão da Nina que produziu a resposta. */
  ninaSessionId: string | null;
  /** FASE 5 — lote de entrada: quais mensagens do paciente geraram a resposta. */
  batchId: string | null;
  batchMessageIds: string[];
  batchSize: number;
  conversationRevision: number | null;
  executionId: string | null;
  timestamp: string;
  intencao: string | null;
  acaoSolicitada: AcaoSolicitada | null;
  /** FASE 3 — natureza do turno avaliado (saudação, esclarecimento, ...). */
  tipoTurno: import("./turno-tipo").TipoTurno | null;
  score: number;
  /** FASE 3: quanto da evidência relevante foi de fato verificada (0–100). */
  evidenceCoverage: number;
  /** Dimensões relevantes que ficaram sem evidência (UNKNOWN). */
  dimensoesDesconhecidas: string[];
  /** Não havia evidência avaliável alguma: a nota não significa segurança. */
  confiancaInsuficiente: boolean;
  nivel: NivelConfianca;
  decisao: DecisaoMotor;
  validadores: ValidadorAuditado[];
  reasonCodes: string[];
  fontes: FonteAuditada[];
  ferramentas: FerramentaAuditada[];
  bloqueadores: string[];
  resultadoFinal: ResultadoFinalAuditoria;
};

/** Campos que jamais podem virar auditoria (texto livre / conteúdo do turno). */
const CAMPOS_PROIBIDOS = [
  "texto",
  "draft",
  "drafttext",
  "rascunho",
  "resposta",
  "mensagem",
  "prompt",
  "conteudo",
  "conteúdo",
  "historico",
  "histórico",
  "raciocinio",
  "raciocínio",
  "pensamento",
  "reasoning",
  "thought",
  "chain",
];

const LIMITE_TEXTO = 120;
/** FASE 6 — teto de itens e profundidade da evidência estruturada. */
const LIMITE_CONFLITOS = 8;
const LIMITE_ORIGENS = 6;

function proibido(chave: string): boolean {
  const k = chave.toLowerCase();
  return CAMPOS_PROIBIDOS.some((p) => k.includes(p));
}

/**
 * FASE 6 — remove dado pessoal antes de qualquer valor virar auditoria:
 * e-mail, telefone, CPF e sequências longas de dígitos viram marcador.
 */
export function removerPII(valor: string): string {
  return valor
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[email]")
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, "[cpf]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[telefone]");
}

function escalar(v: unknown, truncar = false): string | number | boolean | null {
  if (typeof v === "number" || typeof v === "boolean") return v;
  if (typeof v === "string") {
    const limpo = removerPII(v);
    // Texto livre longo continua sendo descartado; só a evidência estruturada
    // de conflito (whitelist) pode ser truncada em vez de perdida.
    if (limpo.length > LIMITE_TEXTO) return truncar ? limpo.slice(0, LIMITE_TEXTO) : null;
    return limpo || null;
  }
  return null;
}

/** Chaves aceitas dentro de uma estrutura de conflito (whitelist). */
const CHAVE_CAMPO = ["campo", "field", "atributo"];
const CHAVE_ORIGENS = ["valores", "origens", "fontes", "values", "sources"];
const CHAVE_ORIGEM = ["origem", "fonte", "source"];
const CHAVE_VALOR = ["valor", "value"];

function achar(obj: Record<string, unknown>, chaves: string[]): unknown {
  for (const c of chaves) if (c in obj) return obj[c];
  return undefined;
}

/**
 * FASE 6 — preserva a evidência de conflito (campo, origem A/valor A,
 * origem B/valor B) em formato fechado: whitelist de chaves, profundidade
 * máxima 2, quantidade e tamanho limitados, sem PII e sem texto livre.
 */
export function extrairConflitos(
  bruta: Record<string, unknown> | undefined | null,
): ConflitoAuditado[] {
  const saida: ConflitoAuditado[] = [];
  for (const [k, v] of Object.entries(bruta ?? {})) {
    if (!/conflit/i.test(k) || !Array.isArray(v)) continue;
    for (const item of v.slice(0, LIMITE_CONFLITOS)) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const obj = item as Record<string, unknown>;
      const campo = escalar(achar(obj, CHAVE_CAMPO), true);
      const lista = achar(obj, CHAVE_ORIGENS);
      if (!Array.isArray(lista)) continue;
      const origens: ConflitoAuditado["origens"] = [];
      for (const o of lista.slice(0, LIMITE_ORIGENS)) {
        if (!o || typeof o !== "object" || Array.isArray(o)) continue;
        const linha = o as Record<string, unknown>;
        const origem = escalar(achar(linha, CHAVE_ORIGEM), true);
        const valor = escalar(achar(linha, CHAVE_VALOR), true);
        if (origem == null && valor == null) continue;
        origens.push({ origem: String(origem ?? "origem não informada"), valor: String(valor ?? "—") });
      }
      if (origens.length > 0) {
        saida.push({ campo: String(campo ?? "campo não informado"), origens });
      }
    }
  }
  return saida.slice(0, LIMITE_CONFLITOS);
}

/** Mantém só escalares curtos e listas de escalares; descarta o resto. */
export function sanearEvidencia(
  bruta: Record<string, unknown> | undefined | null,
): Record<string, string | number | boolean> {
  const saida: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(bruta ?? {})) {
    if (proibido(k)) continue;
    const s = escalar(v);
    if (s !== null) {
      saida[k] = s;
      continue;
    }
    if (Array.isArray(v)) {
      const itens = v
        .map((i) => escalar(i))
        .filter((i): i is string | number | boolean => i !== null)
        .map((i) => String(i));
      if (itens.length > 0) saida[k] = itens.join(", ").slice(0, 300);
      else if (/conflit/i.test(k)) saida[k] = v.length; // estrutura vai em `conflitos`
    }
  }
  return saida;
}

export function resultadoFinalDa(decisao: DecisaoMotor): ResultadoFinalAuditoria {
  if (decisao === "ALLOW") return "resposta_liberada";
  if (decisao === "CLARIFY") return "pergunta_de_esclarecimento";
  if (decisao === "BLOCK_ACTION") return "acao_bloqueada";
  return "transferido_para_humano";
}

export type EntradaAuditoria = {
  conversationId?: string | null;
  messageId?: string | null;
  /** FASE 6 — id da mensagem realmente enviada, quando já conhecido. */
  outgoingMessageId?: string | null;
  ninaSessionId?: string | null;
  /** FASE 5 — rastreabilidade do lote (somente identificadores, nunca texto). */
  batchId?: string | null;
  batchMessageIds?: string[];
  conversationRevision?: number | null;
  executionId?: string | null;
  intencao?: string | null;
  acaoSolicitada?: AcaoSolicitada | null;
  /** FASE 3 — tipo do turno, para o painel dizer o que foi avaliado. */
  turnType?: import("./turno-tipo").TipoTurno | null;
  timestamp?: string;
  ferramentas?: Array<{
    nome: string;
    capacidade?: string | null;
    fonte?: string | null;
    success: boolean;
    erro?: string | null | undefined;
  }>;
  fontes?: Array<{
    tipo: string;
    referencia?: string | null;
    publicado?: boolean;
    temConteudo: boolean;
  }>;
};

/** Monta o registro auditável de uma decisão do motor. */
export function montarRegistroAuditoria(
  r: ResultadoConfianca,
  e: EntradaAuditoria = {},
): RegistroAuditoriaConfianca {
  const validadores: ValidadorAuditado[] = (r.validators ?? []).map((v) => ({
    validator: v.validator,
    status: v.status,
    reasonCode: v.reasonCode,
    evidence: sanearEvidencia(v.evidence),
    conflitos: extrairConflitos(v.evidence),
  }));

  const reasonCodes = [
    ...new Set(
      validadores
        .filter((v) => v.status !== "PASS" && v.status !== "NOT_APPLICABLE")
        .map((v) => v.reasonCode)
        .filter(Boolean),
    ),
  ];

  return {
    conversationId: e.conversationId ?? null,
    messageId: e.messageId ?? null,
    outgoingMessageId: e.outgoingMessageId ?? null,
    ninaSessionId: e.ninaSessionId ?? null,
    batchId: e.batchId || null,
    batchMessageIds: (e.batchMessageIds ?? (e.messageId ? [e.messageId] : [])).slice(0, 50),
    batchSize: (e.batchMessageIds ?? (e.messageId ? [e.messageId] : [])).length,
    conversationRevision: e.conversationRevision ?? null,
    executionId: e.executionId ?? null,
    timestamp: e.timestamp ?? new Date().toISOString(),
    intencao: e.intencao ?? null,
    // FASE 2: sem ação informada o registro diz "desconhecida", não presume.
    // FASE 1: `null` = turno sem ação (saudação). Só a AUSÊNCIA de informação
    // vira "desconhecida".
    acaoSolicitada: e.acaoSolicitada === undefined ? "desconhecida" : e.acaoSolicitada,
    tipoTurno: e.turnType ?? null,
    score: r.score,
    // FASE 3: nota e cobertura viajam separadas — uma não disfarça a outra.
    evidenceCoverage: r.evidenceCoverage ?? 0,
    dimensoesDesconhecidas: r.unknownDimensions ?? [],
    confiancaInsuficiente: r.confidenceInsufficient ?? false,
    nivel: r.level,
    decisao: r.decision,
    validadores,
    reasonCodes,
    fontes: (e.fontes ?? []).map((f) => ({
      tipo: f.tipo,
      referencia: f.referencia ?? null,
      publicado: f.publicado ?? null,
      temConteudo: f.temConteudo,
    })),
    ferramentas: (e.ferramentas ?? []).map((f) => ({
      nome: f.nome,
      capacidade: f.capacidade ?? null,
      fonte: f.fonte ?? null,
      sucesso: f.success && !f.erro,
      erro: f.erro ? String(f.erro).slice(0, LIMITE_TEXTO) : null,
    })),
    bloqueadores: [...new Set([...(r.hardBlockers ?? []), ...r.blockers])],
    resultadoFinal: resultadoFinalDa(r.decision),
  };
}

// ------------------------------------------------------ leitura para o painel

const ROTULO_VALIDADOR: Record<string, string> = {
  IntentClarityValidator: "Intenção clara",
  EntityResolutionValidator: "Item identificado sem ambiguidade",
  RequiredDataValidator: "Dados necessários presentes",
  OfficialSourceValidator: "Fonte oficial encontrada",
  SourceFreshnessValidator: "Informação atual (publicada e vigente)",
  ToolIntegrityValidator: "Consultas ao sistema íntegras",
  ConflictValidator: "Nenhum conflito entre fontes",
  BusinessRulesValidator: "Regras da clínica atendidas",
  ActionRiskValidator: "Risco da ação compatível com a confiança",
};

export const ROTULO_NIVEL: Record<NivelConfianca, string> = {
  HIGH: "Alta",
  MEDIUM: "Média",
  LOW: "Baixa",
};

/** FASE 3 — como o painel nomeia o tipo do turno avaliado. */
export const ROTULO_TIPO_TURNO: Record<string, string> = {
  SAUDACAO: "Saudação",
  ESCLARECIMENTO: "Esclarecimento",
  INFORMACAO: "Informação",
  OPERACAO: "Operação",
  HANDOFF: "Transferência",
};


/** FASE 5 — como o painel nomeia a decisão do turno e o motivo dela. */
export const ROTULO_DECISAO_TURNO: Record<string, string> = {
  CONTINUE: "Continuar com a Nina",
  CLARIFY: "Perguntar ao paciente",
  BLOCK_ACTION: "Ação suspensa",
  HANDOFF: "Chamar atendente",
};

export const ROTULO_MOTIVO_TURNO: Record<string, string> = {
  GREETING: "Saudação válida — nenhuma ação operacional necessária",
  MISSING_PATIENT_CONTEXT: "Falta um dado do paciente; uma pergunta resolve",
  MISSING_REQUIRED_SOURCE: "A informação exige fonte oficial que não foi encontrada",
  CRITICAL_ACTION_BLOCKED: "Ação crítica sem confirmação segura",
  EXPLICIT_HUMAN_REQUEST: "O paciente pediu para falar com uma pessoa",
  REPEATED_CLARIFICATION_FAILURE: "Esclarecimento repetido sem avanço",
  PATIENT_DISSATISFACTION: "Sinal de insatisfação do paciente",
  LOW_CONFIDENCE_UNRECOVERABLE: "Confiança insuficiente e sem recuperação possível",
  ANSWER_ALLOWED: "Resposta liberada pelo motor",
};

export const ROTULO_RESULTADO: Record<ResultadoFinalAuditoria, string> = {
  resposta_liberada: "Resposta liberada pela Nina.",
  pergunta_de_esclarecimento: "Pergunta de esclarecimento ao paciente.",
  transferido_para_humano: "Transferência para atendente.",
  acao_bloqueada: "Ação bloqueada e encaminhada para a equipe.",
};

export type LinhaConfiabilidade = {
  ok: boolean;
  rotulo: string;
  detalhe: string | null;
  /** Seção em que a linha é mostrada no painel de detalhes. */
  grupo: "validador" | "ferramenta" | "fonte" | "conflito";
  /** Código estruturado do motivo (só evidência observável). */
  reasonCode: string | null;
  /**
   * FASE 2/3 — como a linha deve ser lida no painel:
   * `ok` (atendido), `pendente` (ainda em coleta, NÃO é erro),
   * `nao_aplicavel` (não pertence a este turno) e `falha` (inconsistência
   * real). Só `falha` é erro; as demais são neutras.
   */
  estado?: "ok" | "pendente" | "nao_aplicavel" | "falha";
};

/** Linhas ✓/✕ mostradas na seção "Confiabilidade" da auditoria. */
export function linhasConfiabilidade(
  registro: Pick<RegistroAuditoriaConfianca, "validadores" | "ferramentas" | "fontes">,
): LinhaConfiabilidade[] {
  const linhas: LinhaConfiabilidade[] = registro.validadores
    .map((v) => {
      const detalhes = Object.entries(v.evidence)
        .map(([k, val]) => `${k}: ${val}`)
        .slice(0, 4);
      const detalhe =
        v.status === "PASS"
          ? (detalhes[0] ?? null)
          : v.status === "NOT_APPLICABLE"
            ? null
            : [v.reasonCode, ...detalhes].filter(Boolean).join(" — ");
      return {
        // PENDING é etapa de coleta: não é acerto, mas também não é erro.
        ok: v.status === "PASS",
        rotulo: ROTULO_VALIDADOR[v.validator] ?? v.validator,
        detalhe: detalhe || null,
        grupo: "validador" as const,
        reasonCode: v.reasonCode ? String(v.reasonCode) : null,
        estado:
          v.status === "PASS"
            ? ("ok" as const)
            : v.status === "PENDING"
              ? ("pendente" as const)
              : v.status === "NOT_APPLICABLE"
                ? ("nao_aplicavel" as const)
                : ("falha" as const),
      };
    });


  // FASE 6 — conflito auditável: campo, origem A/valor A, origem B/valor B.
  for (const v of registro.validadores) {
    for (const c of v.conflitos ?? []) {
      linhas.push({
        ok: false,
        rotulo: `Conflito: ${c.campo}`,
        detalhe: c.origens.map((o) => `${o.origem} = ${o.valor}`).join(" ✕ "),
        grupo: "conflito",
        reasonCode: v.reasonCode ? String(v.reasonCode) : null,
      });
    }
  }


  for (const f of registro.ferramentas) {
    linhas.push({
      ok: f.sucesso,
      rotulo: `Consulta: ${f.nome}`,
      detalhe: f.sucesso ? (f.fonte ?? f.capacidade) : (f.erro ?? "sem resposta"),
      grupo: "ferramenta",
      reasonCode: null,
    });
  }
  for (const f of registro.fontes) {
    linhas.push({
      ok: f.temConteudo,
      rotulo: `Fonte: ${f.tipo}${f.referencia ? ` #${f.referencia}` : ""}`,
      detalhe: f.publicado === null ? null : `Registro publicado: ${f.publicado ? "sim" : "não"}`,
      grupo: "fonte",
      reasonCode: null,
    });
  }
  return linhas;
}
