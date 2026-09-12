/**
 * FASE 1 — PACOTE DE EVIDÊNCIAS DA INVESTIGAÇÃO (parte pura, testável).
 *
 * Este módulo define o CONTRATO TIPADO único das evidências usadas por:
 *   - "Analisar com IA" (avaliador, somente leitura);
 *   - "Aplicar correção" (executor técnico).
 *
 * Regras inegociáveis desta camada:
 *  - nada aqui consulta banco, chama modelo ou executa a Nina de novo;
 *  - ausência de registro é LACUNA declarada, nunca prova de que a operação
 *    não aconteceu;
 *  - conteúdo cortado por limite de tamanho é declarado em `cortes`;
 *  - o pacote é identificado por HASH + referências de versão. Contagem de
 *    mensagens ou etapas NÃO comprova que duas análises usaram as mesmas
 *    evidências.
 */

import type { Etapa, FonteEvidencia, ReferenciaCodigo, TipoEtapa } from "./evidencias";

export const VERSAO_CONTRATO_PACOTE = "pacote-evidencias-v1" as const;

/** Limite por texto individual dentro do pacote. */
export const LIMITE_TEXTO_PACOTE = 6000;

/* ------------------------------------------------------------------ */
/* Contrato tipado                                                     */
/* ------------------------------------------------------------------ */

/**
 * Etapa da execução no formato canônico. É o MESMO formato gravado pelo
 * coletor (`Etapa`): `tipo`, `fonte`, `titulo`, `em`, `dados`, `codigo`.
 * Não existe mais tradução silenciosa para `etapa`/`detalhe`.
 */
export type EtapaEvidencia = {
  tipo: TipoEtapa | string;
  fonte: FonteEvidencia | string | null;
  titulo: string;
  em: string | null;
  dados: Record<string, unknown>;
  codigo: ReferenciaCodigo | null;
  /** Execução que produziu esta etapa (uma investigação pode ter várias). */
  execucaoId: string | null;
};

/** Mensagem de entrada REALMENTE vinculada a uma execução. */
export type MensagemEntradaEvidencia = {
  id: string;
  texto: string;
  em: string | null;
  execucaoId: string | null;
  /** `true` quando o id está vinculado mas a mensagem não foi encontrada. */
  ausente: boolean;
};

export type ExecucaoEvidencia = {
  id: string;
  conversaId: string | null;
  principal: boolean;
  modelo: string | null;
  nivel: string | null;
  latenciaMs: number | null;
  knowledgeStatus: string | null;
  toolCalls: unknown;
  sucesso: boolean | null;
  categoriaErro: string | null;
  handoff: boolean | null;
  retries: number | null;
  inputTokens: number | null;
  outputTokens: number | null;
  em: string | null;
  /** IDs de entrada declarados pela execução (mesmo que a mensagem suma). */
  mensagensEntrada: string[];
  /** Erro do provedor registrado nesta tentativa, quando houver. */
  erroProvedor: string | null;
};

export type PromptEvidencia = {
  execucaoId: string | null;
  origem: string | null;
  versaoId: string | null;
  versao: number | null;
  publicadoEm: string | null;
  hash: string | null;
  /** Texto do prompt publicado efetivamente usado (pode vir cortado). */
  promptUtilizado: string | null;
  conteudoEnviado: string | null;
  envelope: string | null;
  contexto: unknown;
  modelo: string | null;
  parametros: unknown;
  ferramentasDeclaradas: unknown;
  /** Contrato de precedência do turno, quando registrado. */
  precedencia: unknown;
};

export type FerramentaEvidencia = {
  nome: string;
  execucaoId: string | null;
  solicitada: boolean;
  executada: boolean;
  resultado: unknown;
  comprovacao: string | null;
  em: string | null;
};

export type ConfiancaEvidencia = {
  execucaoId: string | null;
  escopo: string | null;
  nivel: string | null;
  nota: number | null;
  regrasAplicadas: string[];
  motivo: string | null;
};

export type AlteracaoPosteriorEvidencia = {
  execucaoId: string | null;
  etapa: string;
  motivo: string | null;
  alterou: boolean | null;
  em: string | null;
};

export type EntregaEvidencia = {
  execucaoId: string | null;
  turnoId: string | null;
  mensagemId: string | null;
  texto: string | null;
  textoHash: string | null;
  estado: string | null;
  canal: string | null;
  em: string | null;
};

export type LacunaEvidencia = {
  chave: string;
  rotulo: string;
  /** Por que não há registro. Nunca afirma que a operação não ocorreu. */
  motivo: string;
};

export type AnaliseReferenciada = {
  analiseId: string;
  versao: number | null;
  criteriosVersao: string | null;
  modelo: string | null;
  status: string | null;
  veredito: string | null;
  conclusao: string | null;
  /** Hipóteses/causa provável registradas pela análise escolhida. */
  hipoteses: string[];
};

export type OrigemPacote = "persistido" | "reconstruido" | "enriquecido";

export type PacoteInvestigacao = {
  versaoContrato: typeof VERSAO_CONTRATO_PACOTE;
  geradoEm: string;
  /** Sobe a cada enriquecimento do mesmo pacote. */
  revisao: number;
  origem: OrigemPacote;
  identificacao: {
    clinicaId: string;
    feedbackId: string;
    analiseId: string | null;
    conversaId: string | null;
    execucaoId: string | null;
    turnoId: string | null;
    ambiente: string | null;
  };
  feedback: {
    mensagemReportada: string;
    perguntaReportada: string | null;
    mensagemId: string | null;
    categoria: string | null;
    rootCause: string | null;
    status: string | null;
    reportadoEm: string | null;
  };
  analise: AnaliseReferenciada | null;
  execucoes: ExecucaoEvidencia[];
  entradas: MensagemEntradaEvidencia[];
  prompt: PromptEvidencia | null;
  etapas: EtapaEvidencia[];
  ferramentas: FerramentaEvidencia[];
  confianca: ConfiancaEvidencia[];
  alteracoes: AlteracaoPosteriorEvidencia[];
  entrega: EntregaEvidencia | null;
  /** Referências de código/configuração da versão que produziu o evento. */
  codigo: (ReferenciaCodigo & { execucaoId: string | null })[];
  /** Arquivos que a correção deve tocar, com a revisão conhecida. */
  arquivosAlvo: { arquivo: string; revisao: string | null }[];
  lacunas: LacunaEvidencia[];
  /** Conteúdos cortados por limite de tamanho — nunca silenciosos. */
  cortes: string[];
  hash: string;
};

/* ------------------------------------------------------------------ */
/* Utilitários                                                          */
/* ------------------------------------------------------------------ */

/** Corta preservando a informação de que houve corte. */
export function cortar(
  texto: string | null | undefined,
  rotulo: string,
  cortes: string[],
  limite = LIMITE_TEXTO_PACOTE,
): string | null {
  if (texto === null || texto === undefined) return null;
  if (texto.length <= limite) return texto;
  cortes.push(`${rotulo}: ${texto.length} caracteres, mantidos os primeiros ${limite}.`);
  return `${texto.slice(0, limite)}…[truncado]`;
}

/** JSON estável (chaves ordenadas) — base do hash do pacote. */
export function jsonEstavel(valor: unknown): string {
  const visto = new WeakSet<object>();
  const norm = (v: unknown): unknown => {
    if (v === null || typeof v !== "object") return v === undefined ? null : v;
    if (visto.has(v as object)) return "[circular]";
    visto.add(v as object);
    if (Array.isArray(v)) return v.map(norm);
    const entradas = Object.entries(v as Record<string, unknown>).sort(([a], [b]) =>
      a.localeCompare(b),
    );
    return Object.fromEntries(entradas.map(([k, val]) => [k, norm(val)]));
  };
  return JSON.stringify(norm(valor));
}

/**
 * Hash determinístico (FNV-1a 64 bits, hex). Síncrono de propósito: o hash é
 * calculado no mesmo caminho que monta o pacote, sem depender de WebCrypto.
 */
export function hashConteudo(valor: unknown): string {
  const texto = typeof valor === "string" ? valor : jsonEstavel(valor);
  let h = 0xcbf29ce484222325n;
  const primo = 0x100000001b3n;
  const mascara = 0xffffffffffffffffn;
  for (let i = 0; i < texto.length; i++) {
    h ^= BigInt(texto.charCodeAt(i));
    h = (h * primo) & mascara;
  }
  return h.toString(16).padStart(16, "0");
}

/** Hash do pacote: tudo menos o próprio hash e o instante de geração. */
export function hashDoPacote(p: Omit<PacoteInvestigacao, "hash">): string {
  const { geradoEm: _ignorado, ...resto } = p;
  return hashConteudo(resto);
}

export function selarPacote(p: Omit<PacoteInvestigacao, "hash">): PacoteInvestigacao {
  return { ...p, hash: hashDoPacote(p) };
}

/* ------------------------------------------------------------------ */
/* Conversões e verificações                                            */
/* ------------------------------------------------------------------ */

/** Converte uma etapa gravada pelo coletor para o contrato tipado. */
export function etapaDoColetor(e: Partial<Etapa>, execucaoId: string | null): EtapaEvidencia {
  return {
    tipo: (e.tipo as string) ?? "desconhecida",
    fonte: (e.fonte as string) ?? null,
    titulo: e.titulo ?? "",
    em: e.em ?? null,
    dados: (e.dados as Record<string, unknown>) ?? {},
    codigo: (e.codigo as ReferenciaCodigo) ?? null,
    execucaoId,
  };
}

const ROTULO_LACUNA_PACOTE: Record<string, string> = {
  execucao: "Execução técnica vinculada",
  entradas: "Mensagens de entrada vinculadas",
  prompt: "Prompt publicado utilizado",
  etapas: "Evidência por etapa",
  ferramentas: "Ferramentas solicitadas/executadas",
  confianca: "Avaliações de confiança",
  entrega: "Mensagem efetivamente entregue",
  analise: "Análise escolhida",
  codigo: "Código e configuração da versão do evento",
};

/**
 * Lacunas do pacote. Cada lacuna diz que NÃO HÁ REGISTRO — nunca que a
 * operação deixou de acontecer.
 */
export function lacunasDoPacote(p: Omit<PacoteInvestigacao, "lacunas" | "hash">): LacunaEvidencia[] {
  const faltas: LacunaEvidencia[] = [];
  const falta = (chave: string, motivo: string) =>
    faltas.push({ chave, rotulo: ROTULO_LACUNA_PACOTE[chave] ?? chave, motivo });

  if (!p.execucoes.length) falta("execucao", "Nenhum registro técnico está vinculado a este erro.");
  if (!p.entradas.length) {
    falta("entradas", "Nenhuma mensagem de entrada ficou vinculada à execução.");
  } else if (p.entradas.some((m) => m.ausente)) {
    falta("entradas", "Há id de mensagem vinculado sem a mensagem correspondente disponível.");
  }
  if (!p.prompt) falta("prompt", "O snapshot do prompt desta execução não está disponível.");
  if (!p.etapas.length) falta("etapas", "Nenhuma etapa foi capturada nesta execução.");
  if (!p.ferramentas.length) {
    falta("ferramentas", "Não há registro de ferramenta nesta execução — não é prova de que nenhuma rodou.");
  }
  if (!p.confianca.length) falta("confianca", "Não há avaliação de confiança registrada.");
  if (!p.entrega) falta("entrega", "A mensagem entregue não está vinculada a esta execução.");
  if (!p.analise) falta("analise", "Nenhuma análise concluída foi escolhida para este pacote.");
  if (!p.codigo.length) falta("codigo", "As etapas não informam a referência de código utilizada.");
  return faltas;
}

/** Resumo verificável guardado junto da análise. Hash é o que identifica. */
export type ResumoPacote = {
  hash: string;
  versaoContrato: string;
  revisao: number;
  origem: OrigemPacote;
  entradas: number;
  etapas: number;
  execucoes: number;
  promptVersao: number | null;
  promptHash: string | null;
  lacunas: string[];
  cortes: number;
};

export function resumoDoPacote(p: PacoteInvestigacao): ResumoPacote {
  return {
    hash: p.hash,
    versaoContrato: p.versaoContrato,
    revisao: p.revisao,
    origem: p.origem,
    entradas: p.entradas.length,
    etapas: p.etapas.length,
    execucoes: p.execucoes.length,
    promptVersao: p.prompt?.versao ?? null,
    promptHash: p.prompt?.hash ?? null,
    lacunas: p.lacunas.map((l) => l.chave),
    cortes: p.cortes.length,
  };
}

/**
 * Duas análises usaram o MESMO conjunto de evidências? Só o hash responde.
 * Sem hash dos dois lados, a resposta é "não dá para afirmar" (`null`).
 */
export function mesmoConjuntoDeEvidencias(
  a: { hash?: string | null } | null | undefined,
  b: { hash?: string | null } | null | undefined,
): boolean | null {
  const ha = a?.hash ?? null;
  const hb = b?.hash ?? null;
  if (!ha || !hb) return null;
  return ha === hb;
}
