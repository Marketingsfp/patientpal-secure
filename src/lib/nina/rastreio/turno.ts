/**
 * FASE 1 (Rastreabilidade da execução) — REGISTRO DO TURNO.
 *
 * Objetivo: dada UMA mensagem entregue (ou não entregue), conseguir dizer, sem
 * adivinhação:
 *   - qual versão das Instruções foi usada e de onde ela veio;
 *   - se o modelo foi chamado e em quantas rodadas;
 *   - de onde nasceu o texto final (modelo, código, gate, fallback por erro);
 *   - quem alterou o texto depois que o modelo respondeu;
 *   - qual política/etapa de confiança foi aplicada;
 *   - o que NÃO foi comprovado (lacuna declarada, nunca preenchida por
 *     suposição).
 *
 * Módulo PURO: sem banco, sem rede, sem relógio implícito. Ele não altera o
 * atendimento — só descreve o que aconteceu.
 *
 * Regras que este módulo NÃO relaxa: permissão, isolamento por clínica,
 * consentimento, idempotência, revisão da conversa e prova de gravação
 * continuam em código/banco. Aqui só existe registro.
 */

/** De onde veio o texto realmente entregue (ou por que não houve texto). */
export const ORIGENS_RESPOSTA = [
  /** Texto tal como o modelo devolveu. */
  "modelo",
  /** Texto do modelo alterado por código depois da geração. */
  "modelo_transformado",
  /** Texto escrito pelo próprio código (regra determinística). */
  "codigo",
  /** Caminho determinístico que respondeu ANTES de chamar o modelo. */
  "gate",
  /** Texto alternativo usado porque a geração falhou. */
  "fallback_erro",
  /** Resposta reaproveitada de cache (não é fallback). */
  "cache",
  /** Nada foi entregue ao paciente neste turno. */
  "nenhuma",
] as const;
export type OrigemResposta = (typeof ORIGENS_RESPOSTA)[number];

export const ROTULO_ORIGEM: Record<OrigemResposta, string> = {
  modelo: "Texto do modelo",
  modelo_transformado: "Texto do modelo alterado pelo sistema",
  codigo: "Texto definido por regra do sistema",
  gate: "Resposta determinística antes do modelo",
  fallback_erro: "Texto alternativo após falha",
  cache: "Resposta reaproveitada de cache",
  nenhuma: "Nenhuma resposta entregue",
};

/**
 * SELEÇÃO DA VERSÃO — separada de propósito da origem da resposta.
 * `origem = "cache"` é funcionamento normal (TTL da versão publicada).
 * `fallbackPorErro = true` é queda por falha de leitura/renderização.
 */
export type SelecaoVersaoPrompt = {
  escopo: string;
  versaoId: string | null;
  versao: number | null;
  publicadoEm: string | null;
  origem: "publicada" | "cache" | "codigo";
  fallbackPorErro: boolean;
  motivo: string | null;
  /** Impressão digital do texto realmente enviado ao modelo. */
  hash: string | null;
  carregadoEm: string;
};

/**
 * Passagem por uma etapa que PODE alterar o texto depois que o modelo
 * respondeu. Registrar a passagem não é o mesmo que alterar: a comparação dos
 * hashes (gerados sempre pelo mesmo critério, `hashDoTexto`) é que diz se
 * houve mudança efetiva.
 */
export type TransformacaoResposta = {
  /** Identificador curto da etapa (ex.: "handoff.aviso", "encerramento"). */
  etapa: string;
  motivo: string;
  antesHash: string | null;
  depoisHash: string | null;
  em: string;
};

/** A etapa mudou o texto? `null` = sem hash suficiente para afirmar. */
export function alteracaoDaTransformacao(t: {
  antesHash?: string | null;
  depoisHash?: string | null;
}): boolean | null {
  const a = t.antesHash ?? null;
  const d = t.depoisHash ?? null;
  if (!a || !d) return null;
  return a !== d;
}

export type SituacaoTransformacoes =
  /** Nenhuma etapa registrada depois do modelo. */
  | "sem_transformacoes"
  /** Etapas rodaram, texto final idêntico ao inicial e nenhuma mudou nada. */
  | "sem_alteracao"
  /** O texto final é diferente do texto inicial. */
  | "alterado"
  /** Houve mudança no meio, mas o texto final voltou ao original. */
  | "revertido"
  /** Falta hash para afirmar qualquer coisa. */
  | "indeterminado";

export const ROTULO_SITUACAO_TRANSFORMACAO: Record<SituacaoTransformacoes, string> = {
  sem_transformacoes: "Nenhuma — o texto saiu como o modelo devolveu",
  sem_alteracao: "Finalização executada, sem alteração do texto",
  alterado: "Texto do modelo alterado pelo sistema",
  revertido:
    "Houve alteração intermediária, mas o texto final é igual ao texto original do modelo",
  indeterminado: "Não foi possível determinar se houve alteração",
};

/**
 * Classifica o conjunto de etapas registradas. Compara sempre hash com hash,
 * do mesmo critério; sem hash, declara indeterminado em vez de supor.
 */
export function avaliarTransformacoes(
  transformacoes: readonly {
    antesHash?: string | null;
    depoisHash?: string | null;
  }[],
): SituacaoTransformacoes {
  if (transformacoes.length === 0) return "sem_transformacoes";
  const estados = transformacoes.map(alteracaoDaTransformacao);
  const primeira = transformacoes[0]!.antesHash ?? null;
  const ultima = transformacoes[transformacoes.length - 1]!.depoisHash ?? null;
  if (!primeira || !ultima) {
    // Sem as pontas, só uma mudança comprovada no meio permite afirmar algo.
    return estados.some((e) => e === true) ? "alterado" : "indeterminado";
  }
  if (primeira !== ultima) return "alterado";
  if (estados.some((e) => e === null)) return "indeterminado";
  return estados.some((e) => e === true) ? "revertido" : "sem_alteracao";
}

/**
 * Origem coerente com a evidência: só vira "modelo_transformado" quando houve
 * mudança comprovada do texto.
 */
export function origemComSituacao(
  origem: OrigemResposta | null,
  situacao: SituacaoTransformacoes,
): OrigemResposta | null {
  if (origem === "modelo" && situacao === "alterado") return "modelo_transformado";
  if (origem === "modelo_transformado" && situacao !== "alterado") return "modelo";
  return origem;
}

export type ConfiancaDoTurno = {
  /** "action_safety" | "answer_confidence" */
  avaliacao: string;
  decisao: string | null;
  /** Etapa de ativação progressiva aplicada (A|B|C|D). */
  etapa: string | null;
  modo: string | null;
  score: number | null;
  nivel: string | null;
  /**
   * FASE 2 — a decisão desta avaliação foi APLICADA ao atendimento?
   * `false` = observação (shadow): classifica, não altera nem bloqueia.
   * `null`/ausente = não registrado; não se deduz pela nota.
   */
  aplicada?: boolean | null;
};

export const TEXTO_AVALIACAO_EM_OBSERVACAO =
  "Avaliação em observação: esta avaliação não altera nem bloqueia a resposta";

export const ROTULO_TIPO_AVALIACAO: Record<string, string> = {
  action_safety: "Segurança da ação (operacional)",
  answer_confidence: "Confiança da mensagem final",
};

/** Shadow ou marcada como não aplicada = classificação, nunca intervenção. */
export function avaliacaoEmObservacao(c: {
  modo?: string | null;
  aplicada?: boolean | null;
}): boolean {
  if (c.aplicada === true) return false;
  if (c.aplicada === false) return true;
  return c.modo === "shadow";
}

/**
 * Frase única da avaliação: tipo, nota, decisão REGISTRADA e modo. Nada é
 * deduzido — o que não foi registrado aparece como "não registrada".
 */
export function descreverAvaliacaoConfianca(c: ConfiancaDoTurno): string {
  const tipo = ROTULO_TIPO_AVALIACAO[c.avaliacao] ?? c.avaliacao;
  const nota = c.score == null ? "nota não registrada" : `nota ${c.score}`;
  const decisao = c.decisao ? `decisão registrada ${c.decisao}` : "decisão não registrada";
  const modo = c.modo ? `modo ${c.modo}` : "modo não registrado";
  return `${tipo} · ${nota} · ${decisao} · ${modo}`;
}

/** A avaliação operacional (a que de fato pôde alterar o atendimento). */
export function avaliacaoOperacional(
  avaliacoes: readonly ConfiancaDoTurno[],
): ConfiancaDoTurno | null {
  return [...avaliacoes].reverse().find((c) => !avaliacaoEmObservacao(c)) ?? null;
}

export type EntregaDoTurno = {
  mensagemId: string | null;
  textoHash: string | null;
  tamanho: number | null;
  canal: string | null;
};

export type RegistroTurno = {
  /** Identificador do turno — o mesmo `trace_id` da execução. */
  turnoId: string;
  clinicaId: string | null;
  conversaId: string | null;
  ambiente: string;
  teste: boolean;
  batchId: string | null;
  mensagensEntrada: string[];
  revisaoConversa: number | null;
  /** Execução do gateway que produziu o texto final (quando houve modelo). */
  execucaoId: string | null;
  modeloChamado: boolean;
  rodadas: number;
  modelos: string[];
  prompt: SelecaoVersaoPrompt | null;
  origemResposta: OrigemResposta | null;
  motivoOrigem: string | null;
  transformacoes: TransformacaoResposta[];
  confianca: ConfiancaDoTurno | null;
  entrega: EntregaDoTurno | null;
  /** Diagnóstico autorizado nesta clínica (captura de payload por rodada). */
  diagnostico: boolean;
  iniciadoEm: string;
  encerradoEm: string | null;
};

export type BaseRegistroTurno = {
  turnoId: string;
  clinicaId?: string | null;
  conversaId?: string | null;
  ambiente?: string;
  teste?: boolean;
  batchId?: string | null;
  mensagensEntrada?: string[];
  revisaoConversa?: number | null;
  diagnostico?: boolean;
  iniciadoEm?: string;
};

export function criarRegistroTurno(base: BaseRegistroTurno): RegistroTurno {
  return {
    turnoId: base.turnoId,
    clinicaId: base.clinicaId ?? null,
    conversaId: base.conversaId ?? null,
    ambiente: base.ambiente ?? "producao",
    teste: base.teste === true,
    batchId: base.batchId ?? null,
    mensagensEntrada: [...new Set((base.mensagensEntrada ?? []).filter(Boolean))],
    revisaoConversa: base.revisaoConversa ?? null,
    execucaoId: null,
    modeloChamado: false,
    rodadas: 0,
    modelos: [],
    prompt: null,
    origemResposta: null,
    motivoOrigem: null,
    transformacoes: [],
    confianca: null,
    entrega: null,
    diagnostico: base.diagnostico === true,
    iniciadoEm: base.iniciadoEm ?? new Date().toISOString(),
    encerradoEm: null,
  };
}

/**
 * Fecha o registro. A origem "modelo" só vira "modelo_transformado" quando há
 * evidência de MUDANÇA do texto (hash antes ≠ hash depois). Passar pelo
 * finalizador sem mudar nada não é transformação.
 */
export function finalizarRegistroTurno(
  r: RegistroTurno,
  em: string = new Date().toISOString(),
): RegistroTurno {
  const situacao = avaliarTransformacoes(r.transformacoes);
  return { ...r, origemResposta: origemComSituacao(r.origemResposta, situacao), encerradoEm: em };
}

export const ROTULO_LACUNA_TURNO: Record<string, string> = {
  versao_prompt: "Versão das instruções não registrada nesta execução",
  origem_resposta: "Origem do texto entregue não registrada",
  mensagens_entrada: "Mensagens de entrada não vinculadas ao turno",
  chamada_modelo:
    "Texto atribuído ao modelo sem registro de chamada ao modelo (evidência incoerente)",
  execucao_modelo: "Modelo chamado sem execução registrada",
  confianca: "Política de confiança não registrada para este turno",
  mensagem_entregue: "Mensagem entregue não vinculada ao turno",
};

/** O que NÃO pôde ser comprovado. Lacuna é declarada, nunca preenchida. */
export function lacunasDoTurno(r: RegistroTurno): string[] {
  const faltas: string[] = [];
  if (!r.prompt) faltas.push("versao_prompt");
  if (!r.origemResposta) faltas.push("origem_resposta");
  if (!r.mensagensEntrada.length) faltas.push("mensagens_entrada");
  if (
    (r.origemResposta === "modelo" || r.origemResposta === "modelo_transformado") &&
    !r.modeloChamado
  ) {
    faltas.push("chamada_modelo");
  }
  if (r.modeloChamado && !r.execucaoId) faltas.push("execucao_modelo");
  if (r.modeloChamado && !r.confianca) faltas.push("confianca");
  if (r.origemResposta && r.origemResposta !== "nenhuma" && !r.entrega?.mensagemId) {
    faltas.push("mensagem_entregue");
  }
  return faltas;
}

/**
 * Metadata do evento `turn.summary`. Só referências, contadores e impressões
 * digitais: nenhum texto de paciente, nenhum segredo, nenhum raciocínio do
 * modelo. A sanitização final continua sendo a do tracing.
 */
export function resumoTurnoParaTrace(r: RegistroTurno): Record<string, unknown> {
  return {
    turno_id: r.turnoId,
    ambiente: r.ambiente,
    teste: r.teste,
    batch_id: r.batchId,
    mensagens_entrada: r.mensagensEntrada.length,
    revisao_conversa: r.revisaoConversa,
    modelo_chamado: r.modeloChamado,
    rodadas: r.rodadas,
    modelos: r.modelos,
    execucao_id: r.execucaoId,
    versao_prompt: r.prompt
      ? {
          escopo: r.prompt.escopo,
          versao: r.prompt.versao,
          versao_id: r.prompt.versaoId,
          publicado_em: r.prompt.publicadoEm,
          selecao: r.prompt.origem,
          fallback_por_erro: r.prompt.fallbackPorErro,
          motivo: r.prompt.motivo,
          hash: r.prompt.hash,
          carregado_em: r.prompt.carregadoEm,
        }
      : null,
    origem_resposta: r.origemResposta,
    motivo_origem: r.motivoOrigem,
    transformacoes: r.transformacoes.map((t) => ({
      etapa: t.etapa,
      motivo: t.motivo,
      antes_hash: t.antesHash,
      depois_hash: t.depoisHash,
      /** true = mudou, false = passou sem mudar, null = sem hash para afirmar */
      alterou: alteracaoDaTransformacao(t),
      em: t.em,
    })),
    situacao_transformacoes: avaliarTransformacoes(r.transformacoes),
    confianca: r.confianca,
    entrega: r.entrega,
    diagnostico_autorizado: r.diagnostico,
    lacunas: lacunasDoTurno(r),
    iniciado_em: r.iniciadoEm,
    encerrado_em: r.encerradoEm,
  };
}

/** Node do trace que carrega o resumo do turno. */
export const NODE_RESUMO_TURNO = "turn.summary";

/**
 * Node que liga o turno à mensagem realmente entregue. É gravado depois do
 * envio, porque só então existe o id da mensagem de saída.
 */
export const NODE_ENTREGA_TURNO = "turn.delivery";

/**
 * Marca aplicada a conteúdo redigido/truncado no diagnóstico autorizado, para
 * ninguém confundir corte com ausência de dado.
 */
export const MARCA_TRUNCADO = "…[truncado]";

export function truncarParaDiagnostico(valor: unknown, max = 4000): { texto: string; truncado: boolean } {
  const bruto = typeof valor === "string" ? valor : JSON.stringify(valor ?? null);
  if (bruto.length <= max) return { texto: bruto, truncado: false };
  return { texto: `${bruto.slice(0, max)}${MARCA_TRUNCADO}`, truncado: true };
}
