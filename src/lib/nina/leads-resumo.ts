/**
 * FASE 1 — Dados resumidos dos leads de teste (Homologação).
 *
 * Módulo PURO: recebe as linhas já lidas de `whatsapp_mensagens` (apenas as
 * mais recentes de cada conversa de teste) e devolve, por lead, o resumo que
 * os cards precisam: prévia da última mensagem conversacional, autor,
 * data/hora e contador de não lidas.
 *
 * Regras:
 *  - só entram na prévia mensagens de CONVERSA (paciente e Nina). Eventos
 *    técnicos, auditoria, diagnóstico, troca de sessão, transferência interna
 *    e mensagens de sistema nunca viram prévia;
 *  - o resumo de um lead usa exclusivamente as conversas daquele lead —
 *    nenhuma mensagem cruza de um card para outro;
 *  - nada aqui lê banco nem toca no atendimento real.
 */

export type MensagemResumoRow = {
  id: string;
  conversa_id: string | null;
  direction: string | null;
  body: string | null;
  tipo?: string | null;
  enviada_por?: string | null;
  created_at: string;
  read_at?: string | null;
};

export type AutorResumo = "paciente" | "nina" | "atendente";

export type ResumoLead = {
  leadId: string;
  lastMessageId: string | null;
  lastMessageText: string | null;
  lastMessageAuthor: AutorResumo | null;
  lastMessageAt: string | null;
  unreadCount: number;
  /** Total de mensagens conversacionais consideradas na amostra lida. */
  totalMensagens: number;
};

/** Autores aceitos como conversa (o resto é evento/sistema). */
const AUTORES_CONVERSA = new Set(["paciente", "nina", "atendente", "humano"]);

/** Tipos técnicos que nunca servem de prévia. */
const TIPOS_NAO_CONVERSA = new Set([
  "system",
  "sistema",
  "evento",
  "auditoria",
  "diagnostico",
  "diagnóstico",
  "trace",
  "handoff",
  "transferencia",
  "transferência",
  "sessao",
  "sessão",
]);

export function autorDaMensagem(m: MensagemResumoRow): AutorResumo | null {
  const por = (m.enviada_por ?? "").toLowerCase();
  if (por === "paciente") return "paciente";
  if (por === "nina") return "nina";
  if (por === "atendente" || por === "humano") return "atendente";
  // Sem `enviada_por`: cai na direção (entrada = paciente, saída = Nina).
  if (m.direction === "in") return "paciente";
  if (m.direction === "out") return "nina";
  return null;
}

/** `true` quando a mensagem pode virar prévia do card. */
export function ehConversacional(m: MensagemResumoRow): boolean {
  const tipo = (m.tipo ?? "").toLowerCase();
  if (TIPOS_NAO_CONVERSA.has(tipo)) return false;
  const por = (m.enviada_por ?? "").toLowerCase();
  if (por && !AUTORES_CONVERSA.has(por)) return false;
  if (!autorDaMensagem(m)) return false;
  const texto = (m.body ?? "").trim();
  return texto.length > 0;
}

export function previaTexto(texto: string, limite = 120): string {
  const limpo = texto.replace(/\s+/g, " ").trim();
  return limpo.length > limite ? `${limpo.slice(0, limite - 1)}…` : limpo;
}

const vazio = (leadId: string): ResumoLead => ({
  leadId,
  lastMessageId: null,
  lastMessageText: null,
  lastMessageAuthor: null,
  lastMessageAt: null,
  unreadCount: 0,
  totalMensagens: 0,
});

/**
 * FASE 3 — a mensagem da Nina só conta como não lida quando é posterior ao
 * marcador de leitura individual do usuário. Sem marcador, conta.
 */
export function naoLida(m: MensagemResumoRow, lidoAte: string | null): boolean {
  if (!lidoAte) return true;
  return new Date(m.created_at).getTime() > new Date(lidoAte).getTime();
}

/**
 * Monta o resumo de cada lead.
 *
 * @param conversasPorLead lead → conversas daquele lead (isolamento por card).
 * @param mensagens amostra recente de mensagens (qualquer ordem).
 */
export function resumirLeads(
  conversasPorLead: Record<string, string[]>,
  mensagens: MensagemResumoRow[],
  /**
   * FASE 3 — marcador de leitura DESTE usuário por conversa (data/hora da
   * última mensagem que ele realmente visualizou). Sem marcador, tudo que a
   * Nina respondeu ainda conta como não lido.
   */
  lidoAtePorConversa: Record<string, string | null> = {},
): Record<string, ResumoLead> {
  const leadPorConversa = new Map<string, string>();
  for (const [leadId, ids] of Object.entries(conversasPorLead))
    for (const id of ids) leadPorConversa.set(id, leadId);

  const resumo: Record<string, ResumoLead> = {};
  for (const leadId of Object.keys(conversasPorLead)) resumo[leadId] = vazio(leadId);

  for (const m of mensagens) {
    const leadId = m.conversa_id ? leadPorConversa.get(m.conversa_id) : undefined;
    if (!leadId) continue; // mensagem de outra conversa: nunca entra em card algum
    if (!ehConversacional(m)) continue;
    const atual = resumo[leadId]!;
    atual.totalMensagens += 1;

    const autor = autorDaMensagem(m)!;
    // Não lidas = respostas da Nina posteriores à leitura individual do usuário.
    if (autor === "nina" && naoLida(m, lidoAtePorConversa[m.conversa_id!] ?? null))
      atual.unreadCount += 1;


    const maisNova =
      !atual.lastMessageAt ||
      new Date(m.created_at).getTime() > new Date(atual.lastMessageAt).getTime();
    if (maisNova) {
      atual.lastMessageId = m.id;
      atual.lastMessageText = previaTexto(m.body ?? "");
      atual.lastMessageAuthor = autor;
      atual.lastMessageAt = m.created_at;
    }
  }

  return resumo;
}

/** Rótulo curto do autor exibido na prévia do card. */
export function rotuloAutorResumo(autor: AutorResumo | null): string {
  if (autor === "paciente") return "Paciente";
  if (autor === "nina") return "Nina";
  if (autor === "atendente") return "Atendente";
  return "";
}

/**
 * FASE 4 — ordenação estável por atividade recente.
 *
 * Usa exclusivamente `ultimaAtividadeEm` (última mensagem de CONVERSA). Evento
 * técnico não reposiciona card. Empate/sem atividade cai no índice do lead,
 * então a ordem nunca "dança" entre atualizações.
 */
export function ordenarPorAtividade<T extends { indice: number; ultimaAtividadeEm?: string | null }>(
  leads: T[],
): T[] {
  return leads.slice().sort((a, b) => {
    const ta = a.ultimaAtividadeEm ? new Date(a.ultimaAtividadeEm).getTime() : 0;
    const tb = b.ultimaAtividadeEm ? new Date(b.ultimaAtividadeEm).getTime() : 0;
    if (ta !== tb) return tb - ta;
    return a.indice - b.indice;
  });
}

/**
 * FASE 4 — aplica UMA mensagem nova (realtime) ao resumo de um card, de forma
 * idempotente: reprocessar a mesma `id` não conta duas vezes nem duplica a
 * prévia. `souODono` indica se a conversa aberta é essa (aí não vira não lida).
 */
export function aplicarMensagemRealtime(
  atual: {
    ultimaMensagemId?: string | null;
    ultimaMensagemTexto?: string | null;
    ultimaMensagemAutor?: AutorResumo | null;
    ultimaMensagemEm?: string | null;
    ultimaAtividadeEm?: string | null;
    mensagens?: number;
    naoLidas?: number;
  },
  m: MensagemResumoRow,
  opcoes: { jaAplicada: boolean; abertoAgora: boolean },
) {
  if (opcoes.jaAplicada) return atual;
  const proximo = { ...atual, mensagens: Number(atual.mensagens ?? 0) + 1 };
  if (!ehConversacional(m)) return proximo; // evento técnico: só entra no total
  const autor = autorDaMensagem(m)!;
  const maisNova =
    !atual.ultimaMensagemEm ||
    new Date(m.created_at).getTime() >= new Date(atual.ultimaMensagemEm).getTime();
  if (maisNova) {
    proximo.ultimaMensagemId = m.id;
    proximo.ultimaMensagemTexto = previaTexto(m.body ?? "");
    proximo.ultimaMensagemAutor = autor;
    proximo.ultimaMensagemEm = m.created_at;
    proximo.ultimaAtividadeEm = m.created_at;
  }
  if (autor !== "paciente" && !opcoes.abertoAgora)
    proximo.naoLidas = Number(atual.naoLidas ?? 0) + 1;
  return proximo;
}
