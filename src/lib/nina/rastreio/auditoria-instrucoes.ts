/**
 * AUDITORIA DE APLICAÇÃO DAS INSTRUÇÕES — por TURNO e por RODADA.
 *
 * Responde, com evidência, a uma pergunta só: *como* as instruções publicadas
 * foram aplicadas nesta rodada. Registra separadamente:
 *   - versão/hash do prompt publicado;
 *   - blocos de instrução de sistema efetivamente enviados (inclusive os
 *     adicionais: contrato de precedência, esclarecimento, correção);
 *   - regras identificadas, aplicáveis, não aplicáveis e não interpretadas;
 *   - regras gerais suprimidas por exceção;
 *   - resultado da verificação de CADA exigência;
 *   - resposta original do modelo;
 *   - intervenções posteriores;
 *   - texto realmente entregue e seu hash.
 *
 * Duas invariantes:
 *   1. Nada aqui presume cumprimento: sem exigência extraída, o estado é
 *      `sem_regras` ou `falha_de_interpretacao`, NUNCA "cumpridas".
 *   2. Texto integral só é guardado sob diagnóstico autorizado; fora dele
 *      ficam apenas hashes, tamanhos e identificadores.
 *
 * Módulo PURO: sem banco, sem rede.
 */
import { hashDoTexto } from "@/lib/nina/confidence/hash";
import type { RegraPublicada } from "@/lib/nina/confidence/regras-publicadas";
import { truncarParaDiagnostico } from "./turno";

/** Estado auditável de UMA exigência publicada nesta rodada. */
export type EstadoExigencia =
  | "cumprida"
  | "descumprida"
  | "nao_aplicavel"
  | "indeterminada";

/** Estado agregado das exigências da rodada. */
export type EstadoAuditoria =
  | "cumpridas"
  | "descumpridas"
  | "indeterminadas"
  | "nao_aplicaveis"
  | "sem_regras"
  | "falha_de_interpretacao";

export type ReferenciaRegra = {
  id: string;
  ordem: number | null;
  descricao: string;
  natureza: "exigencia" | "proibicao" | null;
  prioridade: string | null;
  verificacao: string | null;
  condicao: string | null;
  ambiente: string | null;
  versao: string | null;
  hash: string | null;
  /** Só sob diagnóstico autorizado. */
  trecho?: string | null;
};

export type VerificacaoExigencia = {
  regraId: string | null;
  descricao: string;
  estado: EstadoExigencia;
  motivo: string | null;
};

export type BlocoInstrucao = {
  /** `envelope_tecnico`, `comportamento_publicado`, `contrato_precedencia`... */
  rotulo: string;
  origem: string;
  tamanho: number;
  hash: string | null;
  /** Só sob diagnóstico autorizado. */
  texto?: string | null;
};

export type TextoAuditado = {
  hash: string | null;
  tamanho: number;
  /** Só sob diagnóstico autorizado. */
  texto?: string | null;
};

export type IntervencaoAuditada = {
  etapa: string;
  motivo: string;
  alterou: boolean | null;
};

export type AuditoriaInstrucoesRodada = {
  rodada: number;
  execucaoId: string | null;
  modelo: string | null;
  versao: string | null;
  versaoId: string | null;
  promptHash: string | null;
  blocos: BlocoInstrucao[];
  regrasIdentificadas: ReferenciaRegra[];
  regrasAplicaveis: ReferenciaRegra[];
  regrasNaoAplicaveis: ReferenciaRegra[];
  regrasNaoInterpretadas: ReferenciaRegra[];
  /** Regras gerais que uma exceção aplicável suprimiu neste turno. */
  regrasSuprimidas: Array<{ codigo: string; motivo: string | null; por: string | null }>;
  verificacoes: VerificacaoExigencia[];
  estado: EstadoAuditoria;
  /** Resposta ORIGINAL do modelo nesta rodada (antes de qualquer alteração). */
  respostaOriginal: TextoAuditado | null;
  intervencoes: IntervencaoAuditada[];
  /** Texto realmente entregue (preenchido no fechamento do turno). */
  entregue: TextoAuditado | null;
  limitacoes: string[];
  em: string;
};

// ------------------------------------------------------------------ apoio

const MAX_TEXTO_DIAGNOSTICO = 8000;

function textoAuditado(
  valor: string | null | undefined,
  diagnostico: boolean,
): TextoAuditado | null {
  if (valor === null || valor === undefined) return null;
  const base: TextoAuditado = { hash: hashDoTexto(valor), tamanho: valor.length };
  if (!diagnostico) return base;
  return { ...base, texto: truncarParaDiagnostico(valor, MAX_TEXTO_DIAGNOSTICO).texto };
}

export function referenciaRegra(r: RegraPublicada, diagnostico = false): ReferenciaRegra {
  const ref: ReferenciaRegra = {
    id: r.id,
    ordem: typeof r.ordem === "number" ? r.ordem : null,
    descricao: r.descricao,
    natureza: r.natureza ?? null,
    prioridade: r.prioridade ?? null,
    verificacao: r.verificacao ?? null,
    condicao: r.condicao ? r.condicao.tipo : null,
    ambiente: r.ambiente ?? null,
    versao: r.versao ?? null,
    hash: r.hash ?? null,
  };
  if (diagnostico) ref.trecho = truncarParaDiagnostico(r.trecho ?? "", 2000).texto;
  return ref;
}

/**
 * Estado agregado. Regra de ouro: nenhuma exigência extraída NÃO é
 * cumprimento. Falha de interpretação também não.
 */
export function estadoDaAuditoria(entrada: {
  verificacoes: readonly VerificacaoExigencia[];
  regrasIdentificadas: number;
  regrasAplicaveis: number;
  falhaDeInterpretacao: boolean;
}): EstadoAuditoria {
  if (entrada.falhaDeInterpretacao) return "falha_de_interpretacao";
  if (entrada.regrasIdentificadas === 0) return "sem_regras";
  if (entrada.verificacoes.some((v) => v.estado === "descumprida")) return "descumpridas";
  if (entrada.verificacoes.some((v) => v.estado === "cumprida")) return "cumpridas";
  if (entrada.verificacoes.some((v) => v.estado === "indeterminada")) return "indeterminadas";
  if (entrada.regrasAplicaveis === 0) return "nao_aplicaveis";
  return "indeterminadas";
}

export type EntradaAuditoriaRodada = {
  rodada: number;
  execucaoId?: string | null;
  modelo?: string | null;
  versao?: string | null;
  versaoId?: string | null;
  promptHash?: string | null;
  /** Blocos de sistema realmente enviados, na ordem de composição. */
  blocos?: Array<{ rotulo: string; origem: string; texto: string | null | undefined }>;
  regrasIdentificadas?: readonly RegraPublicada[];
  regrasAplicaveis?: readonly RegraPublicada[];
  regrasNaoInterpretadas?: readonly RegraPublicada[];
  regrasSuprimidas?: ReadonlyArray<{ codigo: string; motivo?: string | null; por?: string | null }>;
  verificacoes?: readonly VerificacaoExigencia[];
  falhaDeInterpretacao?: boolean;
  respostaOriginal?: string | null;
  limitacoes?: readonly string[];
  diagnostico?: boolean;
  em?: string;
};

/** Monta a auditoria de UMA rodada. Não decide nada do atendimento. */
export function montarAuditoriaRodada(e: EntradaAuditoriaRodada): AuditoriaInstrucoesRodada {
  const diag = e.diagnostico === true;
  const identificadas = e.regrasIdentificadas ?? [];
  const aplicaveis = e.regrasAplicaveis ?? [];
  const idsAplicaveis = new Set(aplicaveis.map((r) => r.id));
  const naoAplicaveis = identificadas.filter((r) => !idsAplicaveis.has(r.id));
  const naoInterpretadas =
    e.regrasNaoInterpretadas ?? identificadas.filter((r) => r.interpretada === false);
  const verificacoes = [...(e.verificacoes ?? [])];

  return {
    rodada: e.rodada,
    execucaoId: e.execucaoId ?? null,
    modelo: e.modelo ?? null,
    versao: e.versao ?? null,
    versaoId: e.versaoId ?? null,
    promptHash: e.promptHash ?? null,
    blocos: (e.blocos ?? [])
      .filter((b) => typeof b.texto === "string" && b.texto.trim() !== "")
      .map((b) => {
        const bloco: BlocoInstrucao = {
          rotulo: b.rotulo,
          origem: b.origem,
          tamanho: (b.texto as string).length,
          hash: hashDoTexto(b.texto as string),
        };
        if (diag) {
          bloco.texto = truncarParaDiagnostico(b.texto as string, MAX_TEXTO_DIAGNOSTICO).texto;
        }
        return bloco;
      }),
    regrasIdentificadas: identificadas.map((r) => referenciaRegra(r, diag)),
    regrasAplicaveis: aplicaveis.map((r) => referenciaRegra(r, diag)),
    regrasNaoAplicaveis: naoAplicaveis.map((r) => referenciaRegra(r, diag)),
    regrasNaoInterpretadas: naoInterpretadas.map((r) => referenciaRegra(r, diag)),
    regrasSuprimidas: (e.regrasSuprimidas ?? []).map((s) => ({
      codigo: s.codigo,
      motivo: s.motivo ?? null,
      por: s.por ?? null,
    })),
    verificacoes,
    estado: estadoDaAuditoria({
      verificacoes,
      regrasIdentificadas: identificadas.length,
      regrasAplicaveis: aplicaveis.length,
      falhaDeInterpretacao: e.falhaDeInterpretacao === true,
    }),
    respostaOriginal: textoAuditado(e.respostaOriginal ?? null, diag),
    intervencoes: [],
    entregue: null,
    limitacoes: [...(e.limitacoes ?? [])],
    em: e.em ?? new Date().toISOString(),
  };
}

/** Completa a auditoria com o texto realmente entregue e as intervenções. */
export function fecharAuditoriaRodada(
  a: AuditoriaInstrucoesRodada,
  dados: {
    entregue?: string | null;
    intervencoes?: readonly IntervencaoAuditada[];
    diagnostico?: boolean;
  },
): AuditoriaInstrucoesRodada {
  return {
    ...a,
    entregue:
      dados.entregue === undefined
        ? a.entregue
        : textoAuditado(dados.entregue, dados.diagnostico === true),
    intervencoes: dados.intervencoes ? [...dados.intervencoes] : a.intervencoes,
  };
}

/** Serialização para o `turn.summary`. Sem texto de paciente fora do diagnóstico. */
export function auditoriaParaTrace(a: AuditoriaInstrucoesRodada): Record<string, unknown> {
  return {
    rodada: a.rodada,
    execucao_id: a.execucaoId,
    modelo: a.modelo,
    versao: a.versao,
    versao_id: a.versaoId,
    prompt_hash: a.promptHash,
    blocos: a.blocos,
    regras_identificadas: a.regrasIdentificadas,
    regras_aplicaveis: a.regrasAplicaveis,
    regras_nao_aplicaveis: a.regrasNaoAplicaveis,
    regras_nao_interpretadas: a.regrasNaoInterpretadas,
    regras_suprimidas: a.regrasSuprimidas,
    verificacoes: a.verificacoes,
    estado: a.estado,
    resposta_original: a.respostaOriginal,
    intervencoes: a.intervencoes,
    entregue: a.entregue,
    limitacoes: a.limitacoes,
    em: a.em,
  };
}
