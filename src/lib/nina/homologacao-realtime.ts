/**
 * TEMPO REAL DA HOMOLOGAÇÃO — filtro por ambiente e reconciliação das bolhas.
 *
 * A timeline da Homologação passa a ser dirigida por: bolha otimista +
 * Realtime + mesclagem. O carregamento completo do histórico continua
 * existindo apenas como carga inicial, recuperação e conciliação eventual.
 *
 * ISOLAMENTO (regra permanente): produção e homologação NÃO se misturam.
 * Este módulo torna essa decisão explícita através de `ambiente`:
 * - "producao"    → aceita SOMENTE mensagens reais (`is_teste` falso/ausente);
 * - "homologacao" → aceita SOMENTE mensagens de teste (`is_teste === true`).
 * Os filtros já existentes do Atendimento real continuam intactos: nada aqui
 * afrouxa `realtime-roteador`, `mensagem-realtime` ou `patch-inbox`.
 */

export type AmbienteRealtime = "producao" | "homologacao";

/** Canal usado pelo console de testes (nunca é um número real do WhatsApp). */
export const CANAL_HOMOLOGACAO = "test-console";

export type LinhaMensagemRealtime = {
  id?: string | null;
  clinica_id?: string | null;
  conversa_id?: string | null;
  canal?: string | null;
  wa_message_id?: string | null;
  direction?: string | null;
  body?: string | null;
  enviada_por?: string | null;
  created_at?: string | null;
  recebida_em?: string | null;
  is_teste?: boolean | null;
};

export type MensagemTimeline = {
  id: string;
  conversa_id?: string | null;
  direction: string;
  body: string | null;
  enviada_por: string | null;
  created_at: string;
  execucao_id?: string | null;
  /** Identidade idempotente da mensagem no banco (`test-<lead>-<chave>`). */
  wa_message_id?: string | null;
  /** Estado de envio individual desta bolha — nunca um estado global. */
  estado?: "pending" | "confirmed" | "failed";
};

/** Identidade idempotente que o servidor grava para cada envio de teste. */
export function waIdDoEnvio(leadId: string, chave: string): string {
  return `test-${leadId}-${chave}`;
}

/**
 * A mensagem pode entrar nesta timeline? Exige clínica, conversa aberta e o
 * ambiente correto. Uma mensagem real do WhatsApp nunca entra na Homologação,
 * e uma mensagem de teste nunca entra no Atendimento real.
 */
export function aceitaMensagemRealtime(
  linha: LinhaMensagemRealtime | null | undefined,
  alvo: { ambiente: AmbienteRealtime; clinicaId: string | null; conversaId: string | null },
): boolean {
  if (!linha?.id || !linha.conversa_id) return false;
  if (!alvo.clinicaId || !alvo.conversaId) return false;
  if (linha.clinica_id && linha.clinica_id !== alvo.clinicaId) return false;
  if (linha.conversa_id !== alvo.conversaId) return false;
  const ehTeste = linha.is_teste === true;
  if (alvo.ambiente === "homologacao") {
    // Teste e canal do console: dois sinais, para não depender de um só campo.
    if (!ehTeste) return false;
    if (linha.canal && linha.canal !== CANAL_HOMOLOGACAO) return false;
    return true;
  }
  return !ehTeste;
}

/** Converte a linha do banco na mensagem exibida na timeline. */
export function paraMensagemTimeline(linha: LinhaMensagemRealtime): MensagemTimeline {
  return {
    id: String(linha.id),
    conversa_id: linha.conversa_id ?? null,
    direction: String(linha.direction ?? "in"),
    body: linha.body ?? null,
    enviada_por: linha.enviada_por ?? null,
    created_at: String(linha.created_at ?? linha.recebida_em ?? new Date().toISOString()),
    wa_message_id: linha.wa_message_id ?? null,
    estado: "confirmed",
  };
}

function mesmaMensagem(a: MensagemTimeline, oficial: MensagemTimeline): boolean {
  if (a.id === oficial.id) return true;
  if (a.wa_message_id && oficial.wa_message_id && a.wa_message_id === oficial.wa_message_id) {
    return true;
  }
  return false;
}

/**
 * Mescla a mensagem oficial na timeline SEM piscar: a bolha otimista de mesma
 * identidade (`wa_message_id`) não é removida e reinserida — ela é atualizada
 * na mesma posição, mantendo o horário já exibido. INSERT seguido de UPDATE
 * atualiza a mesma bolha. Nunca duplica.
 */
export function mesclarMensagemTimeline(
  msgs: MensagemTimeline[],
  oficial: MensagemTimeline,
): MensagemTimeline[] {
  const lista = msgs ?? [];
  const i = lista.findIndex((m) => mesmaMensagem(m, oficial));
  if (i >= 0) {
    const atual = lista[i]!;
    const mesclada: MensagemTimeline = {
      ...atual,
      ...oficial,
      // Horário visual continua o da bolha já exibida: nada "pula" na tela.
      created_at: atual.created_at || oficial.created_at,
      estado: "confirmed",
    };
    const nova = [...lista];
    nova[i] = mesclada;
    return nova;
  }
  return [...lista, oficial];
}

/**
 * Conciliação eventual: quando o histórico completo chega, as bolhas ainda
 * não confirmadas continuam visíveis, mas as que o servidor já tem somem —
 * sem duplicar. A carga do servidor nunca apaga o que acabou de ser enviado.
 */
export function reconciliarHistorico(
  doServidor: MensagemTimeline[],
  pendentes: MensagemTimeline[],
): MensagemTimeline[] {
  const oficiais = doServidor ?? [];
  const ids = new Set(oficiais.map((m) => m.id));
  const waIds = new Set(oficiais.map((m) => m.wa_message_id).filter(Boolean) as string[]);
  const sobrando = (pendentes ?? []).filter(
    (p) => !ids.has(p.id) && !(p.wa_message_id && waIds.has(p.wa_message_id)),
  );
  return [...oficiais, ...sobrando];
}
