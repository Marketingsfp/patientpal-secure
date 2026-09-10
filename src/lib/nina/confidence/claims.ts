/**
 * FASE 5 — CLAIM-LEVEL GROUNDING.
 *
 * O problema que este módulo resolve: `catalogoEncontrou = true` era tratado
 * como se validasse a RESPOSTA INTEIRA. Uma resposta, porém, costuma conter
 * várias afirmações independentes:
 *
 *   "Cardiologia custa R$ 150"        -> catálogo publicado (campo valor)
 *   "Dr. João atende"                  -> catálogo publicado (profissional)
 *   "há vaga sábado às 14h"            -> Agenda
 *
 * Se a terceira afirmação não tem evidência, a resposta NÃO é confiável só
 * porque o catálogo respondeu à primeira.
 *
 * Regras deste módulo:
 * 1. Cada afirmação sensível é rastreada individualmente até uma fonte.
 * 2. Nada de chamada extra de modelo (GPT/Sol) no caminho crítico: a
 *    verificação usa contexto estruturado, tool results, fontes recuperadas,
 *    estado operacional e regras determinísticas.
 * 3. Claims estruturados vindos do próprio ciclo do modelo (quando existirem)
 *    têm prioridade; a extração por texto é camada COMPLEMENTAR, nunca a única
 *    fonte de verdade do significado operacional.
 * 4. "Muitos fatos" nunca é penalidade. O que penaliza é fato SEM evidência.
 */
import { classificarAfirmacaoOperacional } from "./workflow";
import type {
  ClaimEstruturado,
  ContextoConfianca,
  ResultadoFerramenta,
  ResultadoValidador,
  TipoClaim,
  TipoFonte,
} from "./types";

const NOME = "ClaimGroundingValidator";

const CAP_CATALOGO = new Set(["searchKnowledgeBase", "listCatalog"]);
const CAP_AGENDA = new Set(["checkAvailability", "listSlots", "createAppointment"]);
const CAP_PROFISSIONAL = new Set(["listProfessionals", "getProfessional"]);

/** Fontes que podem sustentar cada tipo de afirmação. */
const FONTES_ACEITAS: Record<TipoClaim, TipoFonte[]> = {
  valor: ["catalogo_publicado"],
  profissional: ["catalogo_publicado"],
  disponibilidade: ["agenda"],
  preparo: ["catalogo_publicado"],
  regra: ["catalogo_publicado", "instrucoes"],
  agendamento: ["agenda"],
};

export type ClaimAvaliado = {
  id: string;
  tipo: TipoClaim;
  /** Trecho da resposta final que sustenta a classificação. */
  trecho: string;
  /** Como o claim entrou: estrutura do turno ou leitura complementar do texto. */
  origem: "estruturado" | "texto";
  suportado: boolean;
  /** Fonte concreta que sustentou o claim (quando houve). */
  fonte: string | null;
  motivo: string;
};

export type ResultadoGrounding = {
  claims: ClaimAvaliado[];
  total: number;
  suportados: number;
  semEvidencia: ClaimAvaliado[];
};

// ------------------------------------------------------- evidência disponível

function ok(f: ResultadoFerramenta): boolean {
  return f.success && !f.erro;
}

function ferramentaComConteudo(ctx: ContextoConfianca, caps: Set<string>): boolean {
  return ctx.toolResults.some(
    (f) => f.capacidade !== null && caps.has(f.capacidade) && ok(f) && f.temConteudo !== false,
  );
}

function fonteDisponivel(ctx: ContextoConfianca, tipo: TipoFonte): boolean {
  return ctx.retrievedSources.some(
    (s) => s.tipo === tipo && s.temConteudo && s.publicado !== false && s.interna !== true,
  );
}

/** Evidências efetivamente presentes neste turno, por tipo de afirmação. */
export function evidenciasDisponiveis(ctx: ContextoConfianca): Record<TipoClaim, string | null> {
  const catalogo =
    ferramentaComConteudo(ctx, CAP_CATALOGO) || fonteDisponivel(ctx, "catalogo_publicado")
      ? "catalogo_publicado"
      : null;
  const agenda =
    ferramentaComConteudo(ctx, CAP_AGENDA) || fonteDisponivel(ctx, "agenda") ? "agenda" : null;
  const profissional =
    catalogo ?? (ferramentaComConteudo(ctx, CAP_PROFISSIONAL) ? "catalogo_publicado" : null);
  const instrucoes = fonteDisponivel(ctx, "instrucoes") ? "instrucoes" : null;
  const provaAgendamento =
    ctx.operationalState?.appointmentCreated === true && ctx.operationalState?.appointmentId
      ? `appointment_id:${ctx.operationalState.appointmentId}`
      : null;

  return {
    valor: catalogo,
    profissional,
    disponibilidade: agenda,
    preparo: catalogo,
    regra: catalogo ?? instrucoes,
    agendamento: provaAgendamento,
  };
}

// ------------------------------------------------ extração complementar (texto)

const PADROES: Array<{ tipo: TipoClaim; re: RegExp }> = [
  { tipo: "valor", re: /R\$\s?\d[\d.,]*|custa\s+\d|valor\s+(é|de)\s+\d/gi },
  {
    tipo: "profissional",
    re: /\b(dr|dra|doutor|doutora)\.?\s+[A-ZÀ-Ú][\p{L}]+(\s+[A-ZÀ-Ú][\p{L}]+)?/giu,
  },
  {
    tipo: "disponibilidade",
    re: /((temos|há|ha|tem)\s+(vaga|hor[áa]rio|disponibilidade)[^.!?\n]*)|(\b(segunda|ter[çc]a|quarta|quinta|sexta|s[áa]bado|domingo)[^.!?\n]{0,40}\b\d{1,2}\s?(h|:\d{2}))|(\b\d{1,2}\/\d{1,2}[^.!?\n]{0,30}\b\d{1,2}\s?(h|:\d{2}))/gi,
  },
  {
    tipo: "preparo",
    re: /(jejum[^.!?\n]*)|(preparo[^.!?\n]*)|(suspender\s+[^.!?\n]*medica[^.!?\n]*)/gi,
  },
  {
    tipo: "regra",
    re: /((é|e)\s+obrigat[óo]rio[^.!?\n]*)|(n[ãa]o\s+aceitamos[^.!?\n]*)|(o\s+conv[êe]nio[^.!?\n]{0,60}(cobre|n[ãa]o\s+cobre)[^.!?\n]*)/gi,
  },
];

/**
 * Camada COMPLEMENTAR: lê o texto final procurando afirmações sensíveis.
 * Nunca é usada como única fonte de verdade do significado operacional —
 * afirmações de agendamento vêm da gramática já existente do workflow.
 */
export function extrairClaimsDoTexto(texto: string): Array<{ tipo: TipoClaim; trecho: string }> {
  const t = (texto ?? "").trim();
  if (!t) return [];
  const achados: Array<{ tipo: TipoClaim; trecho: string }> = [];
  const vistos = new Set<string>();

  for (const { tipo, re } of PADROES) {
    for (const m of t.matchAll(re)) {
      const trecho = String(m[0]).trim().slice(0, 160);
      const chave = `${tipo}:${trecho.toLowerCase()}`;
      if (!trecho || vistos.has(chave)) continue;
      vistos.add(chave);
      achados.push({ tipo, trecho });
      if (achados.length >= 30) return achados;
    }
  }

  // Afirmação operacional de agendamento: gramática única, a do workflow.
  const operacional = classificarAfirmacaoOperacional(t);
  if (operacional === "sucesso_agendamento") {
    achados.push({ tipo: "agendamento", trecho: "afirmação de agendamento concluído" });
  }
  return achados;
}

// ------------------------------------------------------------- avaliação

/**
 * Avalia claim a claim contra a evidência realmente disponível no turno.
 * Determinístico: nenhuma chamada de modelo acontece aqui.
 */
export function avaliarGrounding(ctx: ContextoConfianca, texto?: string | null): ResultadoGrounding {
  const disponivel = evidenciasDisponiveis(ctx);
  const estruturados: ClaimEstruturado[] = ctx.claims ?? [];
  const claims: ClaimAvaliado[] = [];
  const vistos = new Set<string>();

  const registrar = (
    tipo: TipoClaim,
    trecho: string,
    origem: ClaimAvaliado["origem"],
    fonteDeclarada: TipoFonte | null,
  ) => {
    const chave = `${tipo}:${trecho.toLowerCase()}`;
    if (vistos.has(chave)) return;
    vistos.add(chave);

    const fonte = disponivel[tipo];
    const aceitas = FONTES_ACEITAS[tipo];
    const declaradaValida =
      fonteDeclarada === null || aceitas.includes(fonteDeclarada) || tipo === "agendamento";

    if (!fonte) {
      claims.push({
        id: `${tipo}-${claims.length + 1}`,
        tipo,
        trecho,
        origem,
        suportado: false,
        fonte: null,
        motivo:
          tipo === "agendamento"
            ? "afirmação de agendamento sem prova persistida (appointment_id)"
            : `sem evidência de ${aceitas.join(" ou ")} para esta afirmação`,
      });
      return;
    }
    if (!declaradaValida) {
      claims.push({
        id: `${tipo}-${claims.length + 1}`,
        tipo,
        trecho,
        origem,
        suportado: false,
        fonte,
        motivo: `fonte declarada (${fonteDeclarada}) não é oficial para ${tipo}`,
      });
      return;
    }
    claims.push({
      id: `${tipo}-${claims.length + 1}`,
      tipo,
      trecho,
      origem,
      suportado: true,
      fonte,
      motivo: "afirmação apoiada em registro do sistema",
    });
  };

  for (const c of estruturados) {
    registrar(c.tipo, (c.texto ?? "").trim().slice(0, 160) || c.tipo, "estruturado", c.fonte?.tipo ?? null);
  }
  for (const c of extrairClaimsDoTexto(texto ?? ctx.draftText ?? "")) {
    registrar(c.tipo, c.trecho, "texto", null);
  }

  const semEvidencia = claims.filter((c) => !c.suportado);
  return {
    claims,
    total: claims.length,
    suportados: claims.length - semEvidencia.length,
    semEvidencia,
  };
}

/** Ações em que uma resposta sem texto ainda assim precisaria de fonte. */
const ACOES_COM_DADO_OFICIAL = new Set([
  "informar_valor",
  "informar_horario",
  "informar_profissional",
  "informar_disponibilidade",
  "informar_preparo",
  "informar_regra",
  "criar_agendamento",
  "cancelar_agendamento",
]);

/**
 * Validador de grounding por afirmação. Substitui a lógica de "muitos fatos =
 * menos confiança": o que derruba a nota é FATO SEM EVIDÊNCIA.
 */
export function ClaimGroundingValidator(ctx: ContextoConfianca): ResultadoValidador {
  const texto = ctx.draftText ?? "";
  const temTexto = texto.trim().length > 0;
  const estruturados = ctx.claims ?? [];

  if (!temTexto && estruturados.length === 0) {
    // Sem texto final não dá para verificar afirmação nenhuma. Se a ação
    // dependeria de dado oficial, isso é UNKNOWN (derruba cobertura), não PASS.
    return ctx.requestedAction !== null && ACOES_COM_DADO_OFICIAL.has(ctx.requestedAction)
      ? res("UNKNOWN", 0, "SEM_TEXTO_PARA_VERIFICAR", { avaliadas: 0 })
      : res("NOT_APPLICABLE", 100, "NADA_A_VERIFICAR", {});
  }

  const r = avaliarGrounding(ctx, texto);
  if (r.total === 0) {
    return res("NOT_APPLICABLE", 100, "SEM_AFIRMACOES_VERIFICAVEIS", { avaliadas: 0 });
  }
  if (r.semEvidencia.length === 0) {
    return res("PASS", 100, "TODAS_AS_AFIRMACOES_COM_FONTE", {
      total: r.total,
      claims: r.claims.map((c) => ({ tipo: c.tipo, fonte: c.fonte })),
    });
  }

  return {
    validator: NOME,
    status: "BLOCK",
    score: Math.round((r.suportados / r.total) * 100),
    reasonCode: "AFIRMACAO_SEM_EVIDENCIA",
    evidence: {
      total: r.total,
      suportados: r.suportados,
      semEvidencia: r.semEvidencia.map((c) => ({
        tipo: c.tipo,
        trecho: c.trecho,
        motivo: c.motivo,
      })),
    },
    blocker: "AFIRMACAO_SEM_EVIDENCIA",
  };
}

function res(
  status: ResultadoValidador["status"],
  score: number,
  reasonCode: string,
  evidence: Record<string, unknown>,
): ResultadoValidador {
  return { validator: NOME, status, score, reasonCode, evidence, blocker: null };
}
