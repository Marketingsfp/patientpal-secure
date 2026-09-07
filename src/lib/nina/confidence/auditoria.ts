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

export type ValidadorAuditado = {
  validator: string;
  status: StatusValidador;
  reasonCode: string;
  evidence: Record<string, string | number | boolean>;
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
  timestamp: string;
  intencao: string | null;
  acaoSolicitada: AcaoSolicitada;
  score: number;
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

function proibido(chave: string): boolean {
  const k = chave.toLowerCase();
  return CAMPOS_PROIBIDOS.some((p) => k.includes(p));
}

/** Mantém só escalares curtos e listas de escalares; descarta o resto. */
export function sanearEvidencia(
  bruta: Record<string, unknown> | undefined | null,
): Record<string, string | number | boolean> {
  const saida: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(bruta ?? {})) {
    if (proibido(k)) continue;
    if (typeof v === "number" || typeof v === "boolean") {
      saida[k] = v;
    } else if (typeof v === "string") {
      if (v.length <= LIMITE_TEXTO) saida[k] = v;
    } else if (Array.isArray(v)) {
      const itens = v
        .filter((i) => ["string", "number", "boolean"].includes(typeof i))
        .map((i) => String(i))
        .filter((i) => i.length <= LIMITE_TEXTO);
      if (itens.length > 0) saida[k] = itens.join(", ").slice(0, 300);
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
  intencao?: string | null;
  acaoSolicitada?: AcaoSolicitada;
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
    timestamp: e.timestamp ?? new Date().toISOString(),
    intencao: e.intencao ?? null,
    acaoSolicitada: e.acaoSolicitada ?? "responder_informacao",
    score: r.score,
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
};

/** Linhas ✓/✕ mostradas na seção "Confiabilidade" da auditoria. */
export function linhasConfiabilidade(
  registro: Pick<RegistroAuditoriaConfianca, "validadores" | "ferramentas" | "fontes">,
): LinhaConfiabilidade[] {
  const linhas: LinhaConfiabilidade[] = registro.validadores
    .filter((v) => v.status !== "NOT_APPLICABLE")
    .map((v) => {
      const detalhes = Object.entries(v.evidence)
        .map(([k, val]) => `${k}: ${val}`)
        .slice(0, 4);
      const detalhe =
        v.status === "PASS"
          ? (detalhes[0] ?? null)
          : [v.reasonCode, ...detalhes].filter(Boolean).join(" — ");
      return {
        ok: v.status === "PASS",
        rotulo: ROTULO_VALIDADOR[v.validator] ?? v.validator,
        detalhe: detalhe || null,
      };
    });

  for (const f of registro.ferramentas) {
    linhas.push({
      ok: f.sucesso,
      rotulo: `Consulta: ${f.nome}`,
      detalhe: f.sucesso ? (f.fonte ?? f.capacidade) : (f.erro ?? "sem resposta"),
    });
  }
  for (const f of registro.fontes) {
    linhas.push({
      ok: f.temConteudo,
      rotulo: `Fonte: ${f.tipo}${f.referencia ? ` #${f.referencia}` : ""}`,
      detalhe: f.publicado === null ? null : `Registro publicado: ${f.publicado ? "sim" : "não"}`,
    });
  }
  return linhas;
}
