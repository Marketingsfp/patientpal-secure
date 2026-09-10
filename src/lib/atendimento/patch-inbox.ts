/**
 * FASE 4 — atualização pontual da lista de conversas (Inbox).
 *
 * Antes, qualquer mensagem nova mandava buscar de novo as 200 conversas do
 * filtro atual. Agora, quando o próprio evento em tempo real já traz o que
 * mudou, a linha da conversa é ajustada localmente: prévia, horário, não
 * lidas, responsável e status. A lista inteira só é conferida quando o evento
 * não é suficiente (conversa que entra ou sai do filtro, por exemplo).
 *
 * Isto é apresentação: nenhuma permissão, RLS ou validação do servidor é
 * dispensada aqui.
 */
import {
  atendenteFiltroEfetivo,
  conversaDoAtendente,
  escopoComAtendente,
  conversaVisivelNoEscopo,
  type EscopoInbox,
  type ConversaEscopo,
} from "./escopo-inbox";

export type LinhaLista = {
  id: string;
  ultima_msg_preview?: string | null;
  ultima_msg_em?: string | null;
  nao_lidas?: number | null;
  [k: string]: any;
};

export type ResultadoPatch = {
  /** Lista já ajustada (mesma referência quando nada mudou). */
  lista: LinhaLista[];
  /** O evento foi suficiente: não é preciso recarregar a lista. */
  aplicado: boolean;
  /** É preciso conferir a lista no servidor (entrada/saída de filtro). */
  reconciliar: boolean;
};

function instante(v: any): number {
  const t = new Date(v ?? 0).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * FASE 4 — a ordem do card segue o eixo de Visualização ativo, igual à do
 * servidor: Recentes por última mensagem, Resolvidas por data de resolução,
 * Maior espera pela métrica canônica de paciente aguardando.
 */
export type VisualizacaoPatch = "recentes" | "resolvidas" | "espera";

function ordenar(
  lista: LinhaLista[],
  visualizacao: VisualizacaoPatch = "recentes",
  espera: Record<string, string> = {},
): LinhaLista[] {
  return [...lista].sort((a, b) => {
    let d = 0;
    if (visualizacao === "resolvidas") {
      d = instante(b["resolved_at"] ?? b["closed_at"]) - instante(a["resolved_at"] ?? a["closed_at"]);
    } else if (visualizacao === "espera") {
      const ta = espera[a.id] ? instante(espera[a.id]) : Number.POSITIVE_INFINITY;
      const tb = espera[b.id] ? instante(espera[b.id]) : Number.POSITIVE_INFINITY;
      d = ta - tb;
    }
    if (d === 0) d = instante(b.ultima_msg_em) - instante(a.ultima_msg_em);
    return d !== 0 ? d : a.id.localeCompare(b.id);
  });
}

function textoPrevia(linha: Record<string, any>): string | null {
  const bruto = linha["body"] ?? linha["content"] ?? linha["texto"] ?? null;
  if (typeof bruto !== "string") return null;
  const limpo = bruto.trim();
  if (!limpo) return null;
  return limpo.length > 160 ? `${limpo.slice(0, 160)}…` : limpo;
}

/**
 * Mensagem nova (Realtime de `whatsapp_mensagens`) → ajusta apenas a linha da
 * conversa correspondente. Conversa fora da lista atual devolve
 * `reconciliar: true` (pode ser uma conversa que acabou de entrar no filtro).
 */
export function patchListaPorMensagem(
  lista: LinhaLista[],
  linha: Record<string, any> | null | undefined,
  ctx: { conversaAberta: string | null },
): ResultadoPatch {
  const conversaId = String(linha?.["conversa_id"] ?? "");
  const quando = linha?.["created_at"] ?? linha?.["criado_em"] ?? null;
  if (!conversaId || !quando || !Array.isArray(lista)) {
    return { lista: lista ?? [], aplicado: false, reconciliar: true };
  }
  const alvo = lista.find((c) => c.id === conversaId);
  if (!alvo) return { lista, aplicado: false, reconciliar: true };

  const entrada = linha?.["direction"] === "in";
  const previa = textoPrevia(linha ?? {}) ?? alvo.ultima_msg_preview ?? null;
  const maisNova = instante(quando) >= instante(alvo.ultima_msg_em);
  const contaNaoLida = entrada && ctx.conversaAberta !== conversaId;

  if (!maisNova && !contaNaoLida) return { lista, aplicado: true, reconciliar: false };

  const atualizada = lista.map((c) => {
    if (c.id !== conversaId) return c;
    return {
      ...c,
      ultima_msg_preview: maisNova ? previa : c.ultima_msg_preview,
      ultima_msg_em: maisNova ? String(quando) : c.ultima_msg_em,
      nao_lidas: contaNaoLida ? Number(c.nao_lidas ?? 0) + 1 : (c.nao_lidas ?? 0),
    };
  });
  return { lista: ordenar(atualizada), aplicado: true, reconciliar: false };
}

/** O estado escolhido no seletor "Todas / Em espera / Ativas / Fechadas". */
export type FiltroStatusInbox = "all" | "active" | "waiting" | "closed" | string;

function statusCombina(conversa: Record<string, any>, filtro?: FiltroStatusInbox | null): boolean {
  if (!filtro || filtro === "all") return true;
  return String(conversa["status"] ?? "") === filtro;
}

/**
 * Mudança na própria conversa (`atend_conversas`): responsável, status,
 * prévia, horário.
 *
 * FASE 3 — quando o próprio evento já traz a linha inteira, a conversa que
 * passa a pertencer ao filtro é inserida na hora e a que deixa de pertencer
 * sai na hora, sem buscar as 200 conversas de novo. A lista completa só é
 * conferida quando o evento não basta (busca por texto ativa, por exemplo).
 */
export function patchListaPorConversa(
  lista: LinhaLista[],
  linha: Record<string, any> | null | undefined,
  ctx: {
    escopo: EscopoInbox;
    userId: string;
    gestor: boolean;
    /** FASE 1 — filtro de supervisão por atendente (só visualização). */
    atendenteId?: string | null;
    /** Seletor de estado (Ativas, Em espera, Fechadas, Todas). */
    status?: FiltroStatusInbox | null;
    /** Busca por texto/número ativa: a lista vem reduzida pelo servidor. */
    buscando?: boolean;
    /** FASE 4 — eixo de Visualização ativo (Recentes/Resolvidas/Espera). */
    visualizacao?: VisualizacaoPatch;
    /** Métrica canônica de paciente aguardando (`atend_espera_por_conversa`). */
    espera?: Record<string, string>;
  },
): ResultadoPatch {
  const id = String(linha?.["id"] ?? "");
  if (!id || !Array.isArray(lista)) {
    return { lista: lista ?? [], aplicado: false, reconciliar: true };
  }
  const visualizacao: VisualizacaoPatch = ctx.visualizacao ?? "recentes";
  const espera = ctx.espera ?? {};
  const atendenteAlvo = atendenteFiltroEfetivo(ctx.atendenteId, ctx.gestor);
  const fechada = STATUS_FECHADOS.includes(
    String(linha?.["status"] ?? "") as (typeof STATUS_FECHADOS)[number],
  );

  let visivel: boolean;
  if (visualizacao === "resolvidas") {
    // FASE 3/4 — responsabilidade da conversa resolvida NÃO é
    // `atribuida_user_id` (fica nulo ao encerrar): vale quem era responsável
    // no momento da resolução, ou quem resolveu.
    const alvo = atendenteAlvo ?? (ctx.gestor ? null : ctx.userId);
    const dono =
      !alvo ||
      linha?.["last_assigned_user_id"] === alvo ||
      linha?.["resolved_by"] === alvo;
    visivel = fechada && dono;
  } else {
    visivel =
      !fechada &&
      conversaVisivelNoEscopo(linha as ConversaEscopo, {
        ...ctx,
        escopo: escopoComAtendente(ctx.escopo, ctx.atendenteId, ctx.gestor),
      }) &&
      conversaDoAtendente(linha as ConversaEscopo, atendenteAlvo) &&
      statusCombina(linha as Record<string, any>, ctx.status);
    // "Maior espera" mostra só quem o paciente deixou aguardando; a métrica
    // canônica vem da consulta de espera, nunca é recalculada aqui.
    if (visivel && visualizacao === "espera" && !espera[id]) visivel = false;
  }
  const existente = lista.find((c) => c.id === id);

  // Saiu do filtro (transferida para outra pessoa, encerrada, devolvida à
  // fila): some da lista imediatamente, sem recarregar nada.
  if (existente && !visivel) {
    return { lista: lista.filter((c) => c.id !== id), aplicado: true, reconciliar: false };
  }

  // Entrou no filtro (transferência, handoff da Nina, atribuição automática):
  // aparece na hora, na posição correta pela última mensagem.
  if (!existente && visivel) {
    // Durante uma busca a lista é um recorte do servidor: não dá para saber
    // localmente se a conversa pertence ao resultado.
    if (ctx.buscando) return { lista, aplicado: false, reconciliar: true };
    if (linha?.["is_teste"] === true) return { lista, aplicado: true, reconciliar: false };
    return {
      lista: ordenar([...lista, { ...(linha as LinhaLista) }]),
      aplicado: true,
      reconciliar: false,
    };
  }

  if (!existente) return { lista, aplicado: true, reconciliar: false };

  const mesclada = { ...existente, ...linha };
  const mudou = Object.keys(mesclada).some((k) => mesclada[k] !== existente[k]);
  if (!mudou) return { lista, aplicado: true, reconciliar: false };
  return {
    lista: ordenar(lista.map((c) => (c.id === id ? mesclada : c))),
    aplicado: true,
    reconciliar: false,
  };
}
