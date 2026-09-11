/**
 * FASE 4 — CONTRATO DE PRECEDÊNCIA EXPLÍCITO.
 *
 * Antes desta fase, orientação interna entrava no diálogo como se fosse uma
 * mensagem do paciente (falso `role: "user"`) e disputava atenção com o
 * comportamento publicado sem nenhuma regra de quem vence. Agora existe um
 * contrato:
 *
 *   1. ENVELOPE TÉCNICO       — regras de API/segurança. Nunca cede.
 *   2. INEGOCIÁVEL            — proteções validadas em código (agendamento,
 *                               privacidade, fonte oficial). Nunca cede.
 *   3. EXCEÇÃO PUBLICADA      — exceção válida do comportamento publicado,
 *                               aplicável a este turno.
 *   4. REGRA GERAL            — o comportamento publicado no caso comum
 *                               (ex.: apresentação obrigatória na 1ª mensagem).
 *   5. EVENTO DO FLUXO        — fato do turno. É DADO, nunca ordem.
 *
 * Uma exceção aplicável suprime a regra geral que ela declara suprimir — e
 * somente essa. Nenhuma exceção suprime item inegociável: a tentativa é
 * registrada e descartada.
 *
 * Módulo PURO: sem banco, sem rede, sem estado.
 */

export type NivelPrecedencia =
  | "envelope_tecnico"
  | "inegociavel"
  | "excecao_publicada"
  | "regra_geral"
  | "evento_do_fluxo";

/** Ordem de força. Menor número vence. */
const FORCA: Record<NivelPrecedencia, number> = {
  envelope_tecnico: 0,
  inegociavel: 1,
  excecao_publicada: 2,
  regra_geral: 3,
  evento_do_fluxo: 4,
};

/**
 * Códigos que NENHUMA exceção pode desligar. São exatamente as proteções que
 * continuam validadas em código, fora do texto do prompt.
 */
export const CODIGOS_INEGOCIAVEIS = [
  "BLOQUEIO_AGENDAMENTO_SEM_CONFIRMACAO",
  "BLOQUEIO_ACAO_CRITICA",
  "FONTE_OFICIAL_OBRIGATORIA",
  "PRIVACIDADE_PACIENTE",
  "SEM_ACAO_REAL_EM_HOMOLOGACAO",
] as const;

export type CodigoInegociavel = (typeof CODIGOS_INEGOCIAVEIS)[number];

/**
 * Restrição estruturada: substitui a orientação interna em texto solto.
 * `codigo` é estável e auditável; `descricao` é curta e sem PII.
 */
export type RestricaoEstruturada = {
  codigo: string;
  nivel: NivelPrecedencia;
  /** De onde veio (versão publicada, verificação de homologação, fluxo). */
  origem: string;
  descricao: string;
  /** Por que esta restrição está no contrato deste turno (auditoria). */
  motivo?: string;
  /** Códigos de regra geral que esta exceção substitui neste turno. */
  suprime?: readonly string[];
  /** Instrução literal que o modelo deve receber, quando houver. */
  texto?: string;
};

/** Fato do turno. Entra no contexto como dado, nunca como ordem. */
export type EventoDeTurno = {
  codigo: string;
  valor: unknown;
};

export type EntradaPrecedencia = {
  regrasGerais: readonly RestricaoEstruturada[];
  excecoes: readonly RestricaoEstruturada[];
  eventos?: readonly EventoDeTurno[];
};

export type ResultadoPrecedencia = {
  /** Restrições vigentes, da mais forte para a mais fraca. */
  vigentes: RestricaoEstruturada[];
  /** Códigos de regra geral suprimidos por exceção aplicável. */
  suprimidas: string[];
  /** Tentativas de suprimir item inegociável (registradas e descartadas). */
  supressoesRecusadas: string[];
  eventos: EventoDeTurno[];
};

/** Resolve o conflito entre regra geral e exceção aplicável do turno. */
export function resolverPrecedencia(e: EntradaPrecedencia): ResultadoPrecedencia {
  const suprimidas: string[] = [];
  const supressoesRecusadas: string[] = [];

  for (const excecao of e.excecoes) {
    for (const alvo of excecao.suprime ?? []) {
      if ((CODIGOS_INEGOCIAVEIS as readonly string[]).includes(alvo)) {
        supressoesRecusadas.push(alvo);
        continue;
      }
      if (!suprimidas.includes(alvo)) suprimidas.push(alvo);
    }
  }

  const geraisVigentes = e.regrasGerais.filter((r) => !suprimidas.includes(r.codigo));
  const vigentes = [...e.excecoes, ...geraisVigentes].sort(
    (a, b) => FORCA[a.nivel] - FORCA[b.nivel],
  );

  return {
    vigentes,
    suprimidas,
    supressoesRecusadas,
    eventos: [...(e.eventos ?? [])],
  };
}

/** Código canônico da regra geral de apresentação/saudação. */
export const REGRA_SAUDACAO = "APRESENTACAO_OBRIGATORIA";

/**
 * A apresentação continua obrigatória nas conversas comuns. Ela deixa de ser
 * obrigatória apenas quando uma exceção publicada aplicável a suprime — o
 * fato `sessao.saudacao_obrigatoria` sozinho não vence a exceção.
 */
export function saudacaoObrigatoriaEfetiva(
  saudacaoObrigatoria: boolean,
  resultado: ResultadoPrecedencia,
): boolean {
  if (!saudacaoObrigatoria) return false;
  return !resultado.suprimidas.includes(REGRA_SAUDACAO);
}

/**
 * Bloco de restrições para o system prompt. Vai como CONTRATO nomeado, não
 * como mensagem do paciente. Sem restrição textual, devolve string vazia.
 */
export function textoContratoPrecedencia(r: ResultadoPrecedencia): string {
  const comTexto = r.vigentes.filter((v) => (v.texto ?? "").trim().length > 0);
  if (comTexto.length === 0) return "";
  const linhas = comTexto.map(
    (v) =>
      `- [${v.nivel}] ${v.codigo}${v.motivo ? ` (origem: ${v.origem}; motivo: ${v.motivo})` : ""}: ${v.texto}`,
  );
  return [
    "CONTRATO DE PRECEDÊNCIA DESTE TURNO (ordem de força: envelope técnico > inegociável > exceção publicada > regra geral):",
    ...linhas,
  ].join("\n");
}

/** Resumo auditável, sem PII: o que valeu e o que foi suprimido. */
export function resumoPrecedencia(r: ResultadoPrecedencia) {
  return {
    vigentes: r.vigentes.map((v) => ({
      codigo: v.codigo,
      nivel: v.nivel,
      origem: v.origem,
      motivo: v.motivo ?? null,
    })),
    regras_gerais_suprimidas: r.suprimidas,
    supressoes_recusadas: r.supressoesRecusadas,
    eventos: r.eventos.map((ev) => ev.codigo),
  };
}
