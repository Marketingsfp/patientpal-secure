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

/* ------------------------------------------------- FASE 3 — estado da saída */

/**
 * Estados COMPROVADOS da saída. Não existe estado deduzido: sem evidência,
 * o estado é "indeterminada".
 *  - preparada: o texto existe, mas nenhuma mensagem gravada foi vinculada;
 *  - persistida: a mensagem de saída foi gravada (no console, o fim da linha);
 *  - enviada: houve entrega ao transporte, sem confirmação registrada;
 *  - confirmada: o transporte confirmou (id de transporte registrado);
 *  - falhou: a persistência/envio falhou de forma registrada.
 */
export const ESTADOS_SAIDA = [
  "preparada",
  "persistida",
  "enviada",
  "confirmada",
  "falhou",
  "indeterminada",
] as const;
export type EstadoSaida = (typeof ESTADOS_SAIDA)[number];

export const CANAL_CONSOLE = "test-console";

export type EventoEntregaTurno = {
  turnoId?: string | null;
  execucaoId?: string | null;
  conversaId?: string | null;
  mensagemId?: string | null;
  canal?: string | null;
  estado?: string | null;
  transporteId?: string | null;
  em?: string | null;
};

export type EvidenciaSaida = {
  estado: EstadoSaida;
  mensagemId: string | null;
  canal: string | null;
  tamanho: number | null;
  /** Homologação/console: nunca há transporte real. */
  console: boolean;
  descricao: string;
  /** Qual vínculo/confirmação exatamente falta (null = nada falta). */
  faltando: string | null;
};

const DESCRICAO_SAIDA: Record<EstadoSaida, string> = {
  preparada: "Resposta preparada — ainda sem vínculo com a mensagem gravada",
  persistida: "Resposta gravada na conversa",
  enviada: "Envio registrado ao transporte",
  confirmada: "Entrega confirmada pelo transporte",
  falhou: "Falha registrada ao gravar ou enviar a resposta",
  indeterminada: "Não há registro suficiente para afirmar o estado da saída",
};

/**
 * O evento de saída pertence a ESTE turno? Nunca associa por proximidade:
 * exige o mesmo turno (ou a mesma execução) e, quando as duas pontas
 * registram conversa, a mesma conversa. O isolamento por clínica é feito na
 * consulta (os eventos já vêm filtrados pela clínica).
 */
export function eventoEntregaDoTurno(
  evento: EventoEntregaTurno,
  alvo: { turnoId?: string | null; execucaoId?: string | null; conversaId?: string | null },
): boolean {
  const mesmoTurno =
    (!!alvo.turnoId && evento.turnoId === alvo.turnoId) ||
    (!!alvo.execucaoId && !!evento.execucaoId && evento.execucaoId === alvo.execucaoId);
  if (!mesmoTurno) return false;
  if (alvo.conversaId && evento.conversaId && evento.conversaId !== alvo.conversaId) return false;
  return true;
}

/**
 * Junta o que o resumo do turno registrou (gravado ANTES da persistência, por
 * isso costuma trazer `mensagemId: null`) com os eventos de saída gravados
 * depois. O resumo é imutável: a evidência posterior o completa, nunca o
 * substitui — e a ausência de evidência jamais vira "falha de entrega".
 */
export function evidenciaSaidaDoTurno(dados: {
  entregaDoResumo?: Partial<EntregaDoTurno> | null;
  eventos?: readonly EventoEntregaTurno[];
  ambiente?: string | null;
  teste?: boolean | null;
}): EvidenciaSaida {
  const resumo = dados.entregaDoResumo ?? null;
  const eventos = dados.eventos ?? [];
  const ultimo = eventos.length ? eventos[eventos.length - 1]! : null;

  const canal = ultimo?.canal ?? resumo?.canal ?? null;
  const console =
    canal === CANAL_CONSOLE || dados.teste === true || dados.ambiente === "homologacao";
  const mensagemId = ultimo?.mensagemId ?? resumo?.mensagemId ?? null;
  const tamanho = resumo?.tamanho ?? null;

  let estado: EstadoSaida;
  const registrado = ultimo?.estado ?? null;
  if (registrado && (ESTADOS_SAIDA as readonly string[]).includes(registrado)) {
    estado = registrado as EstadoSaida;
  } else if (ultimo) {
    estado = mensagemId ? (ultimo.transporteId ? "confirmada" : console ? "persistida" : "enviada") : "falhou";
  } else if (mensagemId) {
    estado = console ? "persistida" : "enviada";
  } else if (resumo) {
    estado = "preparada";
  } else {
    estado = "indeterminada";
  }

  let descricao = DESCRICAO_SAIDA[estado];
  if (console && estado === "persistida") {
    descricao = "Resposta persistida no console — homologação não envia pelo WhatsApp";
  } else if (!console && estado === "persistida") {
    descricao = "Resposta gravada na conversa — sem confirmação de transporte registrada";
  } else if (!console && estado === "enviada") {
    descricao = "Envio registrado — sem confirmação do transporte";
  }

  let faltando: string | null = null;
  if (!mensagemId && estado !== "falhou") {
    faltando = "identificador da mensagem gravada não vinculado a este turno";
  } else if (!console && (estado === "persistida" || estado === "enviada")) {
    faltando = "confirmação de entrega pelo transporte não registrada";
  } else if (estado === "indeterminada") {
    faltando = "nenhum registro de saída para este turno";
  }

  return { estado, mensagemId, canal, tamanho, console, descricao, faltando };
}

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
  /** FASE 2 — TODAS as avaliações do turno, na ordem em que ocorreram. */
  avaliacoes: ConfiancaDoTurno[];
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
    avaliacoes: [],
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
    /** FASE 2 — cada avaliação com seu modo; shadow não vira intervenção. */
    avaliacoes: r.avaliacoes,
    avaliacao_operacional: avaliacaoOperacional(r.avaliacoes ?? []),
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
