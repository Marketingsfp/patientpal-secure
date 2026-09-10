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

/** Alteração aplicada ao texto DEPOIS que o modelo respondeu. */
export type TransformacaoResposta = {
  /** Identificador curto da etapa (ex.: "handoff.aviso", "encerramento"). */
  etapa: string;
  motivo: string;
  antesHash: string | null;
  depoisHash: string | null;
  em: string;
};

export type ConfiancaDoTurno = {
  /** "action_safety" | "answer_confidence" */
  avaliacao: string;
  decisao: string | null;
  /** Etapa de ativação progressiva aplicada (A|B|C|D). */
  etapa: string | null;
  modo: string | null;
  score: number | null;
  nivel: string | null;
};

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
 * Fecha o registro. A origem "modelo" vira "modelo_transformado" quando o
 * código alterou o texto depois — é isso que responde "quem mudou a resposta".
 */
export function finalizarRegistroTurno(
  r: RegistroTurno,
  em: string = new Date().toISOString(),
): RegistroTurno {
  const origem =
    r.origemResposta === "modelo" && r.transformacoes.length > 0
      ? "modelo_transformado"
      : r.origemResposta;
  return { ...r, origemResposta: origem, encerradoEm: em };
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
      em: t.em,
    })),
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
