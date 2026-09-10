/**
 * FASE 1 — filtros da Inbox em DOIS EIXOS.
 *
 * Eixo 1 (Escopo): "de quem são as conversas?" — Minhas, Todas (equipe),
 * Nina ou um atendente específico (sempre por `user_id`, nunca por nome).
 * Eixo 2 (Visualização): "que tipo de conversa quero ver?" — Recentes,
 * Resolvidas ou Maior tempo esperando (cada uma já traz sua ordenação).
 *
 * Este módulo é a fonte única que traduz os dois controles para os filtros
 * que a consulta já usava (escopo, atendente, status, ordenação). Ele não
 * amplia permissão nenhuma: sem supervisão, o atendente continua vendo só o
 * que já via, e o backend segue sendo a autoridade.
 */
import type { EscopoInbox } from "./escopo-inbox";

/** Escopo escolhido no primeiro controle (sem o atendente). */
export type EscopoBaseInbox = "minhas" | "equipe" | "nina";

/** Segundo controle. Cada visualização tem ordenação natural própria. */
export type VisualizacaoInbox = "recentes" | "resolvidas" | "espera";

export const ESCOPO_BASE_PADRAO: EscopoBaseInbox = "minhas";
export const VISUALIZACAO_PADRAO: VisualizacaoInbox = "recentes";

const PREFIXO_AGENTE = "agente:";

export interface EstadoFiltrosInbox {
  base: EscopoBaseInbox;
  /** `user_id` do atendente selecionado (supervisão). `null` = todos. */
  atendenteId: string | null;
  visualizacao: VisualizacaoInbox;
  /** Fila de não atribuídas, acionada pela Central de Atenção. */
  naoAtribuidas: boolean;
  gestor: boolean;
  meuId: string | null;
}

/** Valor mostrado no seletor de escopo. */
export function valorEscopoControle(base: EscopoBaseInbox, atendenteId: string | null): string {
  return atendenteId ? `${PREFIXO_AGENTE}${atendenteId}` : base;
}

/** Lê o valor do seletor de escopo de volta para o estado interno. */
export function lerValorEscopo(valor: string): {
  base: EscopoBaseInbox;
  atendenteId: string | null;
} {
  if (valor.startsWith(PREFIXO_AGENTE)) {
    const id = valor.slice(PREFIXO_AGENTE.length).trim();
    // Atendente específico é supervisão: a consulta parte da equipe e o
    // responsável é fixado pelo user_id.
    return { base: "equipe", atendenteId: id || null };
  }
  const base: EscopoBaseInbox =
    valor === "equipe" || valor === "nina" ? valor : ESCOPO_BASE_PADRAO;
  return { base, atendenteId: null };
}

/** Escopo efetivo enviado para a consulta (contrato antigo, inalterado). */
export function escopoConsulta(e: EstadoFiltrosInbox): EscopoInbox {
  if (e.naoAtribuidas) return "nao_atribuidas";
  // O histórico encerrado vive no escopo "fechadas"; os demais escopos
  // escondem conversas fechadas por regra do backend.
  if (e.visualizacao === "resolvidas") return "fechadas";
  return e.base;
}

/**
 * Atendente aplicado à consulta. Em "Resolvidas · Minhas", o próprio usuário
 * entra como atendente para o supervisor não receber o histórico da clínica
 * inteira quando pediu só o dele.
 */
export function atendenteConsulta(e: EstadoFiltrosInbox): string | null {
  if (!e.gestor) return null;
  if (e.atendenteId) return e.atendenteId;
  if (e.visualizacao === "resolvidas" && e.base === "minhas") return e.meuId ?? null;
  return null;
}

/**
 * Status enviado à consulta.
 *
 * FASE 2 — o estado da conversa passou a ser responsabilidade da
 * visualização (aplicada no backend), que cobre `closed` E `finished`.
 * O parâmetro `status` continua existindo para outros usos, mas a Inbox
 * envia sempre "all" e deixa a matriz decidir.
 */
export function statusConsulta(_v: VisualizacaoInbox): "all" {
  return "all";
}

/**
 * FASE 2 — plano de consulta de uma visualização. É o que permite montar a
 * query de forma composicional (escopo → estado → ordenação → limite), sem
 * uma implementação diferente para cada combinação.
 */
export interface PlanoVisualizacao {
  /** Só conversas encerradas/resolvidas. */
  somenteResolvidas: boolean;
  /** Só conversas em que o paciente está aguardando (métrica canônica). */
  exigeEsperaPaciente: boolean;
  /** Coluna de ordenação aplicada no banco. */
  ordenarPor: "ultima_msg_em" | "resolved_at" | "aguardando_desde";
  /** Ascendente = mais antigo primeiro (maior espera). */
  ascendente: boolean;
}

export function planoVisualizacao(v: VisualizacaoInbox): PlanoVisualizacao {
  if (v === "resolvidas") {
    return {
      somenteResolvidas: true,
      exigeEsperaPaciente: false,
      ordenarPor: "resolved_at",
      ascendente: false,
    };
  }
  if (v === "espera") {
    return {
      somenteResolvidas: false,
      exigeEsperaPaciente: true,
      ordenarPor: "aguardando_desde",
      ascendente: true,
    };
  }
  return {
    somenteResolvidas: false,
    exigeEsperaPaciente: false,
    ordenarPor: "ultima_msg_em",
    ascendente: false,
  };
}

/** Ordenação natural de cada visualização. */
export function ordemVisualizacao(v: VisualizacaoInbox): "recentes" | "espera" {
  return v === "espera" ? "espera" : "recentes";
}

/**
 * "Maior tempo esperando" usa a métrica canônica de paciente aguardando
 * (`atend_espera_por_conversa`), não a última mensagem: conversa em que a
 * clínica é que aguarda o paciente fica de fora.
 */
export function conversaNaVisualizacao(
  v: VisualizacaoInbox,
  aguardandoDesde: string | null | undefined,
): boolean {
  if (v !== "espera") return true;
  return !!aguardandoDesde;
}

/** Rótulo curto do controle de escopo (o nome do atendente vem de fora). */
export function rotuloEscopo(
  base: EscopoBaseInbox,
  nomeAtendente: string | null,
): string {
  if (nomeAtendente) return nomeAtendente;
  return base === "equipe" ? "Todas" : base === "nina" ? "Nina" : "Minhas";
}

export const ROTULO_VISUALIZACAO: Record<VisualizacaoInbox, string> = {
  recentes: "Recentes",
  resolvidas: "Resolvidas",
  espera: "Maior espera",
};

/** Estado de escopo correspondente a um destino antigo (deep-link, Central). */
export function estadoDeEscopoLegado(destino: EscopoInbox): {
  base: EscopoBaseInbox;
  visualizacao: VisualizacaoInbox | null;
  naoAtribuidas: boolean;
} {
  if (destino === "fechadas") {
    return { base: "minhas", visualizacao: "resolvidas", naoAtribuidas: false };
  }
  if (destino === "nao_atribuidas") {
    return { base: "equipe", visualizacao: null, naoAtribuidas: true };
  }
  return { base: destino as EscopoBaseInbox, visualizacao: null, naoAtribuidas: false };
}
